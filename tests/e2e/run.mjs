// End-to-end suite for Bütçemiz. Run: node tests/e2e/run.mjs [ID-filter...]
// Prerequisite: `npx vite build` (dist/). This script starts `vite preview` itself and stops it at the end.
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TMP = path.join(HERE, 'tmp');
const REPORT = path.join(HERE, 'report');
const PORT = 4180;
const BASE = `http://localhost:${PORT}/`;
const FILTER = process.argv.slice(2);

fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(REPORT, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(REPORT, { recursive: true });

// ---------------------------------------------------------------- dates / money helpers
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const trd = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const NOW = new Date();
const TODAY = iso(NOW);
const CUR_MONTH = TODAY.slice(0, 7);
const prevMonthDate = (day) => new Date(NOW.getFullYear(), NOW.getMonth() - 1, day);
const LAST_OF_PREV = new Date(NOW.getFullYear(), NOW.getMonth(), 0);
const FIRST_OF_CUR = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const FIRST_OF_NEXT = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1);
const monthLabelTr = (d) => d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
const tl = (n, compact = false) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: compact ? 0 : 2 }).format(n).replace(/^-/, '−');

// ---------------------------------------------------------------- tiny assertion helpers
class AssertError extends Error {}
function assert(cond, msg) { if (!cond) throw new AssertError(msg); }
async function eventually(fn, msg, timeout = 5000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; last = v; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new AssertError(msg + (last instanceof Error ? ` (${last.message.split('\n')[0]})` : last !== undefined ? ` (last: ${JSON.stringify(last)})` : ''));
}
async function visible(loc, msg, timeout = 5000) {
  try { await loc.first().waitFor({ state: 'visible', timeout }); } catch { throw new AssertError(msg); }
}
async function hidden(loc, msg, timeout = 5000) {
  try { await loc.first().waitFor({ state: 'hidden', timeout }); } catch { throw new AssertError(msg); }
}
async function textOf(loc) { return (await loc.first().innerText()).replace(/\s+/g, ' ').trim(); }
async function expectText(loc, expected, msg, timeout = 5000) {
  let got = '';
  await eventually(async () => { got = await textOf(loc); return typeof expected === 'string' ? got.toLocaleLowerCase('tr').includes(expected.toLocaleLowerCase('tr')) : expected.test(got); }, `${msg}: expected ${expected} but got "${got}"`, timeout)
    .catch(() => { throw new AssertError(`${msg}: expected ${expected} but got "${got}"`); });
}

// ---------------------------------------------------------------- app helpers
const LOCAL_KEY = 'budget-data-v1';
async function data(page) { return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), LOCAL_KEY); }
async function txns(page) { return (await data(page))?.txns || []; }
async function tab(page, name) { await page.locator('nav.tabbar').getByRole('button', { name, exact: true }).click(); await visible(page.locator('header.topbar h1', { hasText: name === 'Özet' ? 'Bütçemiz' : name }), `screen "${name}" did not open`); }
function sheet(page, title) { return page.getByRole('dialog', { name: title }); }
async function openAdd(page) {
  await page.getByRole('button', { name: 'Harcama ekle' }).click();
  const dlg = sheet(page, 'Harcama ekle');
  await visible(dlg, 'add sheet did not open');
  return dlg;
}
/** Fill and submit the add form. */
async function addTxn(page, { amount, kind = 'expense', cat, date, card, person, note, expectOk = true } = {}) {
  const dlg = await openAdd(page);
  if (kind === 'income') await dlg.getByRole('tab', { name: 'Gelir' }).click();
  await dlg.getByLabel('Tutar').fill(String(amount));
  if (cat) await dlg.getByRole('button', { name: cat }).first().click();
  if (date) await dlg.getByLabel('Tarih').fill(date);
  if (card) await dlg.getByLabel('Ödeme şekli').selectOption({ label: card });
  if (person) await dlg.getByRole('button', { name: person, exact: false }).click();
  if (note) await dlg.getByLabel('Not (isteğe bağlı)').fill(note);
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  if (expectOk) {
    await hidden(dlg, 'add sheet did not close after saving');
  }
  return dlg;
}
async function toastHas(page, text, msg) { await expectText(page.getByRole('status'), text, msg || 'toast'); }
async function seed(page, d) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [LOCAL_KEY, d]);
  await page.reload();
  await page.locator('nav.tabbar').waitFor();
}
async function loadDemo(page) {
  await tab(page, 'Ayarlar');
  await page.getByRole('button', { name: /Örnek veri yükle/ }).click();
  await toastHas(page, 'Kaydedildi', 'demo data toast');
  await tab(page, 'Özet');
}
function stat(page, label) { return page.locator('.stat', { has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) }).locator('.stat-value'); }

/** Page must not scroll sideways, and no visible element may stick out of the viewport unless it sits in a scroll container. */
async function noHorizontalOverflow(page, where) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.right <= vw + 1 && b.left >= -1) continue;
      let p = el.parentElement, scrolled = false;
      while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { scrolled = true; break; } p = p.parentElement; }
      if (!scrolled) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').join('.')} [${Math.round(b.left)}..${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
    return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, vw, offenders: offenders.slice(0, 5) };
  });
  assert(r.sw <= r.vw && r.bw <= r.vw, `${where}: page scrolls horizontally (scrollWidth ${Math.max(r.sw, r.bw)} > ${r.vw})`);
  assert(r.offenders.length === 0, `${where}: elements outside the ${r.vw}px viewport: ${r.offenders.join('; ')}`);
}
async function clippedText(page, selector) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.textContent} (${e.scrollWidth}>${e.clientWidth})`), selector);
}
async function upload(page, file) {
  await page.locator('[data-testid="file-input"]').setInputFiles(file);
}
async function waitPreview(page) {
  await visible(page.getByRole('heading', { name: /işlem bulundu/ }), 'import preview did not appear', 20000);
}
function importBtn(page) { return page.getByRole('button', { name: /işlemi kaydet/ }); }

// ---------------------------------------------------------------- dummy statement files
const P = (d) => prevMonthDate(d);
const CARD_ROWS = [
  [P(2), 'MIGROS SANAL MARKET ISTANBUL', '1.245,30', '12,45'],
  [P(4), 'YEMEKSEPETI', '389,90', '3,90'],
  [P(6), 'SHELL KADIKOY', '1.500,00', '15,00'],
  [P(9), 'TRENDYOL.COM 2/6 TAKSIT', '833,33', ''],
  [P(11), 'ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ', '-3.000,00', ''],
  [P(13), 'IADE - ZARA ISTANBUL', '250,00+', ''],
  [P(15), 'ECZANE DENEME', '224,19', '2,24'],
  [P(17), 'NETFLIX.COM', '229,99', '2,30'],
];
const CARD_EXPENSE_TOTAL = 1245.30 + 389.90 + 1500 + 833.33 + 224.19 + 229.99; // 4422.71

const ACC_ROWS = [ // newest first, like Garanti
  [P(20), 'TEST APT YÖNETİCİLİĞİ AİDAT -FAST-CEP ŞUBE', 'Para Transferi', '-2.000,00 TL', '30.176,60 TL'],
  [P(18), 'ENERJISA ELEKTRIK FATURA', 'Fatura', '-1.234,56 TL', '32.176,60 TL'],
  [P(14), 'EFT KOMİSYONU', 'Faiz / Komisyon', '-8,50 TL', '33.411,16 TL'],
  [P(12), 'HESAP İŞLETİM ÜCRETİ', 'Faiz / Komisyon', '-25,00 TL', '33.419,66 TL'],
  [P(10), 'DENEME KİŞİ-FAST-CEP ŞUBE-1000000001', 'Para Transferi', '-1.500,00 TL', '33.444,66 TL'],
  [P(7), 'GPY 1. PARA PİYASA FON SATIŞ CEP ŞUBE', 'Yatırım', '+2.170,33 TL', '34.944,66 TL'],
  [P(5), 'K.Kartı Ödeme 4000 **** **** 0000', 'Kart Ödemesi', '-12.345,67 TL', '32.774,33 TL'],
  [P(3), 'MAAŞ ÖDEMESİ', 'Maaş', '+45.000,00 TL', '45.120,00 TL'],
];

const tableCss = `body{font-family:Arial,Helvetica,sans-serif;font-size:10px;margin:18px} td{white-space:nowrap} table{border-collapse:collapse;width:100%} td,th{padding:4px 6px;border-bottom:1px solid #ccc;text-align:left} .r{text-align:right}`;
// Garanti-like: description column has a fixed width so long texts wrap onto a second line.
const WRAP_ROWS = [
  [P(20), 'TEST APT YÖNETİCİLİĞİ 6 NUMARA AİDAT ÖDEMESİ -FAST-CEP ŞUBE-1000000002', 'Para Transferi', '-2.000,00 TL', '31,50 TL'],
  [P(15), 'MIGROS SANAL MARKET', 'Alışveriş', '-845,20 TL', '2.031,50 TL'],
  [P(8), 'DENEME KULLANICI MAAŞ ÖDEMESİ OCAK DÖNEMİ PERSONEL ÜCRETİ BORDRO', 'Maaş', '+17.419,42 TL', '2.876,70 TL'],
];
function wrapHtml() {
  return `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:10px;margin:18px} table{border-collapse:collapse} td,th{padding:3px 6px;text-align:left;vertical-align:middle} td{white-space:nowrap} td.d{white-space:normal;width:190px;max-width:190px} .r{text-align:right}</style></head><body>
<p>T. Garanti Bankası A.Ş.</p><h2>Hesap Hareketleri</h2><p>Bakiye : 31,50 TL</p>
<table><tr><th>Tarih</th><th>Açıklama</th><th>Etiket</th><th class="r">Tutar</th><th class="r">Bakiye</th></tr>
${WRAP_ROWS.map(([d, a, e, t, b]) => `<tr><td>${trd(d)}</td><td class="d">${a}</td><td>${e}</td><td class="r">${t}</td><td class="r">${b}</td></tr>`).join('\n')}
</table></body></html>`;
}
function cardHtml() {
  const cut = prevMonthDate(20), due = prevMonthDate(30);
  return `<html><head><meta charset="utf-8"><style>${tableCss}</style></head><body>
<h2>YAPI KREDİ BANKASI A.Ş. WORLD CARD HESAP ÖZETİ</h2>
<p>Kart Sahibi: DENEME KULLANICI</p>
<p>Hesap Kesim Tarihi: ${trd(cut)} &nbsp;&nbsp; Son Ödeme Tarihi: ${trd(due)}</p>
<p>Dönem Borcu: 4.422,71 TL &nbsp;&nbsp; Asgari Ödeme Tutarı: 1.769,08 TL</p>
<table><tr><th>İşlem Tarihi</th><th>Açıklama</th><th class="r">Tutar</th><th class="r">Puan</th></tr>
${CARD_ROWS.map(([d, a, t, p]) => `<tr><td>${trd(d)}</td><td>${a}</td><td class="r">${t}</td><td class="r">${p}</td></tr>`).join('\n')}
</table><p>Toplam Harcama 4.422,71</p></body></html>`;
}
function accountHtml() {
  return `<html><head><meta charset="utf-8"><style>${tableCss}</style></head><body>
<p>T. Garanti Bankası A.Ş. www.garantibbva.com.tr</p>
<h2>Hesap Hareketleri</h2>
<p>Sayın DENEME KULLANICI, ${trd(prevMonthDate(1))} - ${trd(prevMonthDate(25))} tarihleri arasındaki Hesap Hareketleri bilgileriniz aşağıdaki gibidir.</p>
<p>Bakiye : 30.176,60 TL</p>
<table><tr><th>Tarih</th><th>Açıklama</th><th>Etiket</th><th class="r">Tutar</th><th class="r">Bakiye</th></tr>
${ACC_ROWS.map(([d, a, e, t, b]) => `<tr><td>${trd(d)}</td><td>${a}</td><td>${e}</td><td class="r">${t}</td><td class="r">${b}</td></tr>`).join('\n')}
</table></body></html>`;
}
const CSV_ROWS = [
  [P(3), 'A101 MARKET KADIKÖY', '1.234,56'],
  [P(6), 'STARBUCKS DENEME', '145,00'],
  [P(9), 'TURKCELL FATURA', '650,00'],
  [P(11), 'ACME DENEME MAĞAZASI', '999,99'],
  [P(13), 'ÖDEME - TEŞEKKÜRLER', '-2.000,00'],
];
const FILES = {
  cardPdf: path.join(TMP, 'yapikredi-ekstre.pdf'),
  accPdf: path.join(TMP, 'garanti-hesap-hareketleri.pdf'),
  csv: path.join(TMP, 'kart-ekstre.csv'),
  junkCsv: path.join(TMP, 'notlar.csv'),
  emptyCsv: path.join(TMP, 'bos.csv'),
  brokenPdf: path.join(TMP, 'bozuk.pdf'),
  badJson: path.join(TMP, 'bozuk-yedek.json'),
  wrapPdf: path.join(TMP, 'garanti-uzun-aciklama.pdf'),
  lockedPdf: path.join(TMP, 'sifreli-ekstre.pdf'),
  wrongJson: path.join(TMP, 'yanlis-yedek.json'),
};
async function makeFiles(browser) {
  const pg = await browser.newPage();
  await pg.setContent(cardHtml()); await pg.pdf({ path: FILES.cardPdf, format: 'A4', landscape: true });
  await pg.setContent(accountHtml()); await pg.pdf({ path: FILES.accPdf, format: 'A4', landscape: true });
  await pg.setContent(wrapHtml()); await pg.pdf({ path: FILES.wrapPdf, format: 'A4' });
  await pg.close();
  // Encrypted copy of the card statement (password 123456) — needs python3 + pypdf; TC51 is skipped otherwise.
  try {
    execFileSync('python3', ['-c', 'import sys,pypdf\nr=pypdf.PdfReader(sys.argv[1]);w=pypdf.PdfWriter()\nfor p in r.pages: w.add_page(p)\nw.encrypt("123456", algorithm="RC4-128")\nw.write(sys.argv[2])', FILES.cardPdf, FILES.lockedPdf], { stdio: 'ignore' });
  } catch { /* optional */ }
  fs.writeFileSync(FILES.csv, '﻿İşlem Tarihi;Açıklama;Tutar (TL)\r\n' + CSV_ROWS.map(([d, a, t]) => `${trd(d)};${a};${t}`).join('\r\n') + '\r\n');
  fs.writeFileSync(FILES.junkCsv, 'merhaba dünya\nbu bir ekstre değil\n1;2;3\n');
  fs.writeFileSync(FILES.emptyCsv, '');
  fs.writeFileSync(FILES.brokenPdf, '%PDF-1.4\nthis is not really a pdf\n%%EOF');
  fs.writeFileSync(FILES.badJson, '{"txns": [ this is broken');
  fs.writeFileSync(FILES.wrongJson, JSON.stringify({ hello: 'world' }));
}

// ---------------------------------------------------------------- test registry
const cases = [];
const tc = (id, area, title, fn, opts = {}) => cases.push({ id, area, title, fn, opts });

// ===== General / layout
tc('TC01', 'Genel', 'First launch shows Turkish UI and empty state', async ({ page }) => {
  await expectText(page.locator('header.topbar h1'), 'Bütçemiz', 'title');
  assert((await page.evaluate(() => document.documentElement.lang)) === 'tr', 'html lang should be tr');
  for (const l of ['Özet', 'İşlemler', 'Ekstreler', 'Ayarlar']) await visible(page.locator('nav.tabbar').getByRole('button', { name: l, exact: true }), `tab ${l} missing`);
  await visible(page.getByText('Henüz kayıt yok'), 'empty state missing on Özet');
  await expectText(stat(page, 'Gelir'), '₺0', 'income tile');
  await expectText(stat(page, 'Gider'), '₺0', 'expense tile');
  await expectText(stat(page, 'Bakiye'), '₺0', 'balance tile');
  await expectText(page.locator('.month-nav .month-label'), monthLabelTr(NOW), 'month label');
}, { shot: true });

tc('TC02', 'Genel', 'Tab navigation and empty states on every tab', async ({ page }) => {
  await tab(page, 'İşlemler');
  await visible(page.getByText('Henüz kayıt yok'), 'İşlemler empty state');
  assert(page.url().endsWith('#txns'), 'hash should be #txns');
  await tab(page, 'Ekstreler');
  await visible(page.getByRole('heading', { name: 'Önceki yüklemeler' }), 'Önceki yüklemeler section');
  await tab(page, 'Ayarlar');
  await visible(page.getByRole('heading', { name: 'Kategoriler' }), 'Kategoriler section');
  await page.reload();
  await visible(page.getByRole('heading', { name: 'Kategoriler' }), 'reload should keep the Ayarlar tab (hash)');
});

tc('TC03', 'Düzen', '393px width: no horizontal scroll on any tab (empty and with demo data)', async ({ page }) => {
  assert((await page.evaluate(() => innerWidth)) === 393, 'viewport should be 393px');
  for (const t of ['Özet', 'İşlemler', 'Ekstreler', 'Ayarlar']) { await tab(page, t); await noHorizontalOverflow(page, `${t} (empty)`); }
  await loadDemo(page);
  for (const t of ['Özet', 'İşlemler', 'Ekstreler', 'Ayarlar']) { await tab(page, t); await noHorizontalOverflow(page, `${t} (demo)`); }
  await openAdd(page);
  await noHorizontalOverflow(page, 'add sheet');
}, { shot: true });

tc('TC04', 'Düzen', 'Dark mode uses dark palette and stays readable', async ({ page }) => {
  await loadDemo(page);
  const c = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color, card: getComputedStyle(document.querySelector('.card')).backgroundColor }));
  assert(c.bg === 'rgb(14, 17, 22)', `body background should be dark, got ${c.bg}`);
  assert(c.fg === 'rgb(242, 244, 247)', `text should be light, got ${c.fg}`);
  assert(c.card !== 'rgb(255, 255, 255)', `cards should not be white in dark mode, got ${c.card}`);
  await openAdd(page);
  const s = await page.evaluate(() => getComputedStyle(document.querySelector('.sheet')).backgroundColor);
  assert(s !== 'rgb(255, 255, 255)', `sheet should not be white in dark mode, got ${s}`);
}, { shot: true, ctx: { colorScheme: 'dark' } });

// ===== Quick add
tc('TC05', 'Hızlı ekleme', 'Add a basic expense with + button', async ({ page }) => {
  const dlg = await openAdd(page);
  assert(await dlg.getByLabel('Tutar').evaluate((e) => e === document.activeElement), 'amount field should be focused when the sheet opens');
  await dlg.getByLabel('Tutar').fill('250');
  await dlg.getByRole('button', { name: 'Market' }).click();
  await dlg.getByLabel('Not (isteğe bağlı)').fill('ŞOK Market Deneme');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet should close');
  await toastHas(page, 'Kaydedildi');
  await expectText(stat(page, 'Gider'), '₺250', 'expense tile');
  await expectText(stat(page, 'Bakiye'), '−₺250', 'balance tile negative');
  const t = await txns(page);
  assert(t.length === 1 && t[0].amount === 250 && t[0].category_id === 'groceries' && t[0].kind === 'expense' && t[0].date === TODAY, `stored txn wrong: ${JSON.stringify(t)}`);
  await tab(page, 'İşlemler');
  await visible(page.getByRole('button', { name: /ŞOK Market Deneme/ }), 'row in list');
  await expectText(page.locator('.day-head').first(), 'Bugün', 'day header');
}, { shot: true });

tc('TC06', 'Hızlı ekleme', 'Turkish decimal "1.234,56" is parsed as 1234.56', async ({ page }) => {
  await addTxn(page, { amount: '1.234,56', cat: 'Faturalar' });
  const t = await txns(page);
  assert(t[0]?.amount === 1234.56, `stored ${t[0]?.amount}`);
  await tab(page, 'İşlemler');
  await expectText(page.locator('.txn-amt').first(), '−₺1.234,56', 'list amount');
});

tc('TC07', 'Hızlı ekleme', 'Other number formats: "1,5" → 1.50, "1.234" → 1234, "12.50" → 12.50', async ({ page }) => {
  await addTxn(page, { amount: '1,5', note: 'A' });
  await addTxn(page, { amount: '1.234', note: 'B' });
  await addTxn(page, { amount: '12.50', note: 'C' });
  const t = await txns(page);
  const by = Object.fromEntries(t.map((x) => [x.note, x.amount]));
  assert(by.A === 1.5 && by.B === 1234 && by.C === 12.5, `amounts ${JSON.stringify(by)}`);
});

tc('TC08', 'Hızlı ekleme', 'Zero amount is rejected with a message', async ({ page }) => {
  const dlg = await addTxn(page, { amount: '0', expectOk: false });
  await expectText(dlg.getByRole('alert'), 'Sıfırdan büyük bir tutar girin', 'validation message');
  await visible(dlg, 'sheet should stay open');
  await dlg.getByLabel('Tutar').fill('0,00');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await visible(dlg.getByRole('alert'), '0,00 should also be rejected');
  assert((await txns(page)).length === 0, 'nothing should be saved');
});

tc('TC09', 'Hızlı ekleme', 'Empty and non-numeric amount are rejected', async ({ page }) => {
  const dlg = await openAdd(page);
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await visible(dlg.getByRole('alert'), 'empty amount should show error');
  await dlg.getByLabel('Tutar').pressSequentially('abc');
  assert((await dlg.getByLabel('Tutar').inputValue()) === '', 'letters should be filtered out of the amount field');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await visible(dlg.getByRole('alert'), 'non-numeric amount should show error');
  await dlg.getByLabel('Tutar').fill('1,2,3');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(300);
  const t = await txns(page);
  assert(t.length === 0 || (t.length === 1 && t[0].amount > 0), `ambiguous "1,2,3" stored as ${JSON.stringify(t.map((x) => x.amount))}`);
});

tc('TC10', 'Hızlı ekleme', 'Negative input "-50" never stores a negative amount', async ({ page }) => {
  const dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').pressSequentially('-50');
  const v = await dlg.getByLabel('Tutar').inputValue();
  assert(v === '50', `minus sign should be stripped, field shows "${v}"`);
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet should close');
  const t = await txns(page);
  assert(t.length === 1 && t[0].amount === 50 && t[0].kind === 'expense', `stored ${JSON.stringify(t)}`);
});

tc('TC11', 'Hızlı ekleme', 'Huge amount 9.999.999.999,99 is stored and tiles are not clipped', async ({ page }) => {
  await addTxn(page, { amount: '9.999.999.999,99', cat: 'Kira & Ev' });
  const t = await txns(page);
  assert(t[0]?.amount === 9999999999.99, `stored ${t[0]?.amount}`);
  await expectText(stat(page, 'Gider'), '₺10 Mr', 'expense tile (compact notation for billions)');
  const clipped = await clippedText(page, '.stat-value');
  assert(clipped.length === 0, `stat tiles clip their value: ${clipped.join(', ')}`);
  await noHorizontalOverflow(page, 'Özet with huge amount');
  await tab(page, 'İşlemler');
  await noHorizontalOverflow(page, 'İşlemler with huge amount');
}, { shot: true });

tc('TC12', 'Hızlı ekleme', 'Add income (Gelir) 85.000 Maaş', async ({ page }) => {
  const dlg = await openAdd(page);
  await dlg.getByRole('tab', { name: 'Gelir' }).click();
  await hidden(dlg.getByLabel('Ödeme şekli'), '"Ödeme şekli" should be hidden for income');
  await dlg.getByLabel('Tutar').fill('85.000');
  await dlg.getByRole('button', { name: 'Maaş' }).click();
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet should close');
  await expectText(stat(page, 'Gelir'), '₺85.000', 'income tile');
  await expectText(stat(page, 'Bakiye'), '₺85.000', 'balance tile');
  const t = await txns(page);
  assert(t[0].kind === 'income' && t[0].category_id === 'salary' && t[0].card_id === null, `stored ${JSON.stringify(t[0])}`);
  await page.getByRole('tab', { name: 'Gelirler' }).click();
  await visible(page.locator('.legend-row', { hasText: 'Maaş' }), 'Maaş in income legend');
});

tc('TC13', 'Hızlı ekleme', 'No category chosen → Diğer; card + person stored', async ({ page }) => {
  await addTxn(page, { amount: '75', card: 'Garanti Kart · Ben', person: 'Eşim', note: 'Kategorisiz' });
  const t = (await txns(page))[0];
  assert(t.category_id === 'other' && t.card_id === 'c-garanti-p1' && t.person_id === 'p2', `stored ${JSON.stringify(t)}`);
  await tab(page, 'İşlemler');
  await expectText(page.locator('.txn-sub').first(), 'Diğer · Eşim · Garanti Kart', 'row subtitle');
  // last used person becomes default
  const dlg = await openAdd(page);
  assert(await dlg.getByRole('button', { name: 'Eşim' }).getAttribute('aria-pressed') === 'true', 'last used person should be preselected');
});

tc('TC14', 'Hızlı ekleme', 'Close (X), Escape and backdrop dismiss the sheet without saving', async ({ page }) => {
  let dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('99');
  await dlg.getByRole('button', { name: 'close' }).click();
  await hidden(dlg, 'X should close');
  dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('99');
  await page.keyboard.press('Escape');
  await hidden(dlg, 'Escape should close');
  dlg = await openAdd(page);
  await page.mouse.click(200, 20);
  await hidden(dlg, 'backdrop tap should close');
  assert((await txns(page)).length === 0, 'nothing saved');
});

tc('TC15', 'İşlemler', 'Edit a transaction (amount prefilled with Turkish comma)', async ({ page }) => {
  await addTxn(page, { amount: '250,5', note: 'Düzenlenecek' });
  await tab(page, 'İşlemler');
  await page.getByRole('button', { name: /Düzenlenecek/ }).click();
  const dlg = sheet(page, 'İşlemi düzenle');
  await visible(dlg, 'edit sheet');
  const v = await dlg.getByLabel('Tutar').inputValue();
  assert(v === '250,5', `prefilled amount should be "250,5", got "${v}"`);
  await dlg.getByLabel('Tutar').fill('300');
  await dlg.getByRole('button', { name: 'Yeme & İçme' }).click();
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'edit sheet should close');
  const t = await txns(page);
  assert(t.length === 1 && t[0].amount === 300 && t[0].category_id === 'dining', `stored ${JSON.stringify(t)}`);
  await expectText(page.locator('.txn-amt').first(), '−₺300,00', 'list updated');
});

tc('TC16', 'İşlemler', 'Delete a transaction with confirmation', async ({ page }) => {
  await addTxn(page, { amount: '42', note: 'Silinecek' });
  await tab(page, 'İşlemler');
  await page.getByRole('button', { name: /Silinecek/ }).click();
  await sheet(page, 'İşlemi düzenle').getByRole('button', { name: 'Sil' }).click();
  await toastHas(page, 'Silindi');
  await visible(page.getByText('Henüz kayıt yok'), 'empty state after delete');
  assert((await txns(page)).length === 0, 'txn removed from storage');
});

tc('TC17', 'Kalıcılık', 'Data and settings survive a reload', async ({ page }) => {
  await addTxn(page, { amount: '123,45', note: 'Kalıcı' });
  await tab(page, 'Ayarlar');
  await page.getByLabel('Para birimi').selectOption('EUR');
  await page.reload();
  await page.locator('nav.tabbar').waitFor();
  await tab(page, 'İşlemler');
  await visible(page.getByRole('button', { name: /Kalıcı/ }), 'txn after reload');
  await expectText(page.locator('.txn-amt').first(), '€', 'currency after reload');
});

// ===== Transactions list
async function seedList(page) {
  await addTxn(page, { amount: '100', cat: 'Market', note: 'MİGROS KADIKÖY', person: 'Ben' });
  await addTxn(page, { amount: '200', cat: 'Yeme & İçme', note: 'Şişli Kebapçı', card: 'Garanti Kart · Ben', person: 'Eşim' });
  await addTxn(page, { amount: '300', kind: 'income', cat: 'Prim', note: 'Yıl sonu', person: 'Eşim' });
  await addTxn(page, { amount: '400', cat: 'Market', note: 'Geçen ay market', date: iso(prevMonthDate(10)), person: 'Ben' });
  await tab(page, 'İşlemler');
}
tc('TC18', 'İşlemler', 'Search is case/diacritic-insensitive and shows empty state on no match', async ({ page }) => {
  await seedList(page);
  const search = page.getByLabel('Ara');
  await search.fill('migros');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, '"migros" should match "MİGROS KADIKÖY"');
  await search.fill('sisli');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, '"sisli" should match "Şişli Kebapçı"');
  await search.fill('market');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, '"market" (category) should match only this month');
  await search.fill('zzzz');
  await visible(page.getByText('Henüz kayıt yok'), 'empty state for no match');
});

tc('TC19', 'İşlemler', 'Filter by payment method and by person', async ({ page }) => {
  await seedList(page);
  assert((await page.locator('button.txn').count()) === 3, 'this month has 3 rows');
  await page.getByLabel('Ödeme şekli').selectOption({ label: 'Garanti Kart · Ben' });
  await eventually(async () => (await page.locator('button.txn').count()) === 1, 'card filter → 1 row');
  await page.getByLabel('Ödeme şekli').selectOption({ label: 'Nakit / Banka kartı' });
  await eventually(async () => (await page.locator('button.txn').count()) === 2, 'cash filter → 2 rows');
  await page.getByLabel('Ödeme şekli').selectOption({ label: 'Tüm ödeme yöntemleri' });
  await page.locator('.chips').getByRole('button', { name: 'Eşim' }).click();
  await eventually(async () => (await page.locator('button.txn').count()) === 2, 'person filter Eşim → 2 rows');
  await expectText(page.locator('.list-total'), '+₺300', 'list total income');
  await expectText(page.locator('.list-total'), '−₺200', 'list total expense');
});

tc('TC20', 'İşlemler', 'Month navigation and "Tüm aylar" toggle', async ({ page }) => {
  await seedList(page);
  await page.getByRole('button', { name: 'previous month' }).click();
  await expectText(page.locator('.month-label'), monthLabelTr(prevMonthDate(1)), 'previous month label');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, 'previous month has 1 row');
  await page.getByRole('button', { name: 'month', exact: true }).click();
  await expectText(page.locator('.month-label'), 'Tüm aylar', 'all months label');
  await eventually(async () => (await page.locator('button.txn').count()) === 4, 'all months shows 4 rows');
  await page.getByRole('button', { name: 'month', exact: true }).click();
  await expectText(page.locator('.month-label'), monthLabelTr(NOW), 'back to current month');
});

tc('TC21', 'İşlemler', 'Day groups: Bugün / Dün headers with daily net', async ({ page }) => {
  const y = new Date(NOW); y.setDate(y.getDate() - 1);
  await addTxn(page, { amount: '10', note: 'Bugünkü' });
  await addTxn(page, { amount: '20', note: 'Dünkü', date: iso(y) });
  await tab(page, 'İşlemler');
  if (iso(y).slice(0, 7) !== CUR_MONTH) await page.getByRole('button', { name: 'month', exact: true }).click();
  await expectText(page.locator('.day-head').nth(0), 'Bugün', 'first header');
  await expectText(page.locator('.day-head').nth(0), '−₺10,00', 'today net');
  await expectText(page.locator('.day-head').nth(1), 'Dün', 'second header');
});

// ===== Summary
tc('TC22', 'Özet', 'Month boundaries: last day of previous month, 1st of this month, 1st of next month', async ({ page }) => {
  await addTxn(page, { amount: '100', date: iso(LAST_OF_PREV), note: 'Ay sonu' });
  await addTxn(page, { amount: '200', date: iso(FIRST_OF_CUR), note: 'Ay başı' });
  await addTxn(page, { amount: '50', date: iso(FIRST_OF_NEXT), note: 'Gelecek ay' });
  await expectText(stat(page, 'Gider'), '₺200', 'current month expense only includes the 1st');
  await page.getByRole('button', { name: 'previous month' }).click();
  await expectText(page.locator('.month-label'), monthLabelTr(LAST_OF_PREV), 'prev label');
  await expectText(stat(page, 'Gider'), '₺100', 'previous month expense');
  await page.getByRole('button', { name: 'next month' }).click();
  await page.getByRole('button', { name: 'next month' }).click();
  await expectText(page.locator('.month-label'), monthLabelTr(FIRST_OF_NEXT), 'next label');
  await expectText(stat(page, 'Gider'), '₺50', 'next month expense');
});

tc('TC23', 'Özet', 'Year boundary: navigating back from January reaches December of previous year', async ({ page }) => {
  for (let i = 0; i < NOW.getMonth() + 1; i++) await page.getByRole('button', { name: 'previous month' }).click();
  await expectText(page.locator('.month-label'), monthLabelTr(new Date(NOW.getFullYear() - 1, 11, 1)), 'December of previous year');
  for (let i = 0; i < 13; i++) await page.getByRole('button', { name: 'next month' }).click();
  await expectText(page.locator('.month-label'), monthLabelTr(new Date(NOW.getFullYear() + 1, 0, 1)), 'January of next year');
});

tc('TC24', 'Özet', 'Income / expense / balance tiles, negative balance shown in red with minus', async ({ page }) => {
  await addTxn(page, { amount: '1.000', kind: 'income', cat: 'Prim' });
  await addTxn(page, { amount: '1.500,75' });
  await expectText(stat(page, 'Gelir'), '₺1.000', 'income');
  await expectText(stat(page, 'Gider'), '₺1.501', 'expense (compact, rounded)');
  await expectText(stat(page, 'Bakiye'), '−₺501', 'balance');
  assert(await stat(page, 'Bakiye').evaluate((e) => e.classList.contains('neg')), 'negative balance should use .neg');
});

tc('TC25', 'Özet', 'Person filter on summary', async ({ page }) => {
  await addTxn(page, { amount: '100', person: 'Ben' });
  await addTxn(page, { amount: '300', person: 'Eşim' });
  await expectText(stat(page, 'Gider'), '₺400', 'everyone');
  await page.locator('.chips').getByRole('button', { name: 'Eşim' }).click();
  await expectText(stat(page, 'Gider'), '₺300', 'Eşim only');
  await page.locator('.chips').getByRole('button', { name: 'Ben' }).click();
  await expectText(stat(page, 'Gider'), '₺100', 'Ben only');
  await page.locator('.chips').getByRole('button', { name: 'Herkes' }).click();
  await expectText(stat(page, 'Gider'), '₺400', 'back to everyone');
});

tc('TC26', 'Özet', 'Pie chart + legend: percentages, tap legend to drill down, tap slice', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'previous month' }).click(); // a full demo month
  const rows = page.locator('.legend-row');
  const n = await rows.count();
  assert(n >= 5, `expected several categories, got ${n}`);
  const pcts = await page.locator('.legend-pct').allInnerTexts();
  const sum = pcts.reduce((a, s) => a + parseInt(s, 10), 0);
  assert(sum >= 97 && sum <= 103, `legend percentages should add to ~100, got ${sum}`);
  assert((await page.locator('svg.pie path').count()) >= 5, 'pie should have slices');
  const first = rows.first();
  const name = (await first.locator('.legend-name').innerText()).trim();
  await first.click();
  await visible(page.locator('.legend-detail button.txn'), 'drill-down list should show transactions');
  await eventually(async () => (await page.locator('svg.pie .pie-label').textContent()).includes(name.slice(0, 5)), 'pie centre shows the selected category');
  await first.click();
  await hidden(page.locator('.legend-detail'), 'tapping again collapses');
  await page.locator('svg.pie path').nth(1).click({ force: true });
  await visible(page.locator('.legend-row.on'), 'tapping a slice selects a legend row');
  await page.locator('.legend-detail button.txn').first().click();
  await visible(sheet(page, 'İşlemi düzenle'), 'tapping a drill-down row opens edit');
}, { shot: true });

tc('TC27', 'Özet', '"Ödeme şekli" breakdown and 6-month trend', async ({ page }) => {
  await loadDemo(page);
  const bars = page.locator('section.card', { has: page.getByRole('heading', { name: 'Ödeme şekli' }) });
  await visible(bars, 'Ödeme şekli card');
  await expectText(bars, 'Nakit / Banka kartı', 'cash bar');
  await expectText(bars, 'Garanti Kart · Ben', 'card bar with owner');
  const cols = page.locator('.trend .trend-col');
  assert((await cols.count()) === 6, '6 trend columns');
  const prev = monthLabelTr(prevMonthDate(1));
  await page.getByRole('button', { name: prev }).click();
  await expectText(page.locator('.month-nav .month-label'), prev, 'tapping a trend bar opens that month');
  // Income tab hides the paid-with card
  await page.getByRole('tab', { name: 'Gelirler' }).click();
  await hidden(bars, 'Ödeme şekli hidden for income view');
});

tc('TC28', 'Özet', 'Uncategorised / deleted-category transaction does not break the chart', async ({ page }) => {
  await addTxn(page, { amount: '10' });
  const d = await data(page);
  d.txns.push({ id: 'x-orphan', kind: 'expense', amount: 5, date: TODAY, category_id: 'no-such-cat', person_id: 'p1', card_id: 'gone-card', note: 'Yetim', source: 'manual', import_id: null, created_at: new Date().toISOString() });
  await seed(page, d);
  await visible(page.locator('.legend-row', { hasText: '?' }), 'unknown category shown as "?"');
  await expectText(stat(page, 'Gider'), '₺15', 'total includes orphan');
  await tab(page, 'İşlemler');
  await visible(page.getByRole('button', { name: /Yetim/ }), 'orphan row renders');
});

// ===== Settings
tc('TC29', 'Ayarlar', 'Language switch to English and back; persists after reload', async ({ page }) => {
  await tab(page, 'Ayarlar');
  await page.getByRole('tab', { name: 'English' }).click();
  for (const l of ['Summary', 'Transactions', 'Statements', 'Settings']) await visible(page.locator('nav.tabbar').getByRole('button', { name: l, exact: true }), `EN tab ${l}`);
  assert((await page.evaluate(() => document.documentElement.lang)) === 'en', 'html lang en');
  await page.reload();
  await visible(page.locator('nav.tabbar').getByRole('button', { name: 'Summary', exact: true }), 'EN persists after reload');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await visible(page.getByRole('dialog', { name: 'Add expense' }).getByRole('button', { name: 'Groceries' }), 'category names in English');
  await page.keyboard.press('Escape');
  await page.locator('nav.tabbar').getByRole('button', { name: 'Summary', exact: true }).click();
  await expectText(page.locator('header.topbar h1'), 'Our Budget', 'EN title');
  assert((await page.title()) === 'Our Budget', 'document.title in English');
  await page.locator('nav.tabbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Türkçe' }).click();
  await visible(page.locator('nav.tabbar').getByRole('button', { name: 'Özet', exact: true }), 'back to Turkish');
}, { shot: true });

tc('TC30', 'Ayarlar', 'Currency switch to USD changes formatting', async ({ page }) => {
  await addTxn(page, { amount: '10' });
  await tab(page, 'Ayarlar');
  await page.getByLabel('Para birimi').selectOption('USD');
  await tab(page, 'Özet');
  await expectText(stat(page, 'Gider'), '$', 'USD symbol in tile');
  const dlg = await openAdd(page);
  await expectText(dlg.locator('.amount-cur'), 'USD', 'currency next to amount');
});

tc('TC31', 'Ayarlar', 'Add a person, use it, delete an unused person', async ({ page }) => {
  await tab(page, 'Ayarlar');
  await page.getByRole('button', { name: /Kişi ekle/ }).click();
  let dlg = sheet(page, 'Kişiler');
  await dlg.getByLabel('Ad').fill('  Deneme Kişi  ');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'person sheet closes');
  await visible(page.locator('.row-name', { hasText: /^Deneme Kişi$/ }), 'new person listed (trimmed)');
  const ppl = (await data(page)).people;
  assert(ppl.length === 3, `3 people expected, got ${ppl.length}`);
  // empty name is not saved
  await page.getByRole('button', { name: /Kişi ekle/ }).click();
  dlg = sheet(page, 'Kişiler');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await visible(dlg, 'empty name keeps the sheet open');
  await page.keyboard.press('Escape');
  // delete the unused new person
  await page.locator('.row-btn', { has: page.locator('.row-name', { hasText: /^Deneme Kişi$/ }) }).click();
  await sheet(page, 'Kişiler').getByRole('button', { name: 'Sil' }).click();
  await hidden(page.locator('.row-name', { hasText: 'Deneme Kişi' }), 'person removed');
  // a used person cannot be deleted
  await page.locator('.row-btn', { has: page.locator('.row-name', { hasText: /^Ben$/ }) }).click();
  assert((await sheet(page, 'Kişiler').getByRole('button', { name: 'Sil' }).count()) === 0, 'person with cards must not offer delete');
});

tc('TC32', 'Ayarlar', 'Add a bank account, it appears in Ekstreler; deleting a used card moves txns to cash', async ({ page }) => {
  await tab(page, 'Ayarlar');
  await page.getByRole('button', { name: /Kart ekle/ }).click();
  const dlg = sheet(page, 'Kartlar');
  // label text includes the option texts, so pick the selects by order: Banka, Tür, Sahibi
  const sel = dlg.locator('select');
  await sel.nth(0).selectOption({ label: 'QNB' });
  await sel.nth(1).selectOption({ label: 'Banka hesabı' });
  await dlg.locator('input').first().fill('Deneme Hesap');
  await sel.nth(2).selectOption({ label: 'Eşim' });
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'card sheet closes');
  await visible(page.locator('.rows li', { hasText: 'Deneme Hesap' }).getByText('🏦'), 'account listed with bank icon');
  await tab(page, 'Ekstreler');
  assert((await page.getByLabel('Kart / hesap').locator('option', { hasText: 'Deneme Hesap · Eşim' }).count()) === 1, 'account in import select');
  // use it, then delete it
  await addTxn(page, { amount: '33', card: 'Deneme Hesap · Eşim', note: 'Hesaptan' });
  await tab(page, 'Ayarlar');
  await page.locator('.row-btn', { hasText: 'Deneme Hesap' }).click();
  await sheet(page, 'Kartlar').getByRole('button', { name: 'Sil' }).click();
  await hidden(page.locator('.rows li', { hasText: 'Deneme Hesap' }), 'card removed');
  const t = (await txns(page)).find((x) => x.note === 'Hesaptan');
  assert(t && t.card_id === null, `txn should move to cash, card_id=${t?.card_id}`);
});

tc('TC33', 'Ayarlar', 'Add, rename, hide and delete categories', async ({ page }) => {
  await tab(page, 'Ayarlar');
  await page.getByRole('button', { name: /Kategori ekle/ }).click();
  let dlg = sheet(page, 'Kategoriler');
  await dlg.getByLabel('Ad (TR)').fill('Kırtasiye Deneme');
  await dlg.getByRole('button', { name: '📚' }).click();
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'category sheet closes');
  const c = (await data(page)).categories.find((x) => x.name_tr === 'Kırtasiye Deneme');
  assert(c && c.name_en === 'Kırtasiye Deneme' && c.icon === '📚' && c.kind === 'expense', `stored ${JSON.stringify(c)}`);
  // rename
  await page.getByRole('button', { name: /Kırtasiye Deneme/ }).click();
  dlg = sheet(page, 'Kategoriler');
  await dlg.getByLabel('Ad (TR)').fill('Kırtasiye');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await visible(page.locator('.row-name', { hasText: /^Kırtasiye$/ }), 'renamed');
  // use it and hide it
  await addTxn(page, { amount: '15', cat: 'Kırtasiye', note: 'Defter' });
  await tab(page, 'Ayarlar');
  await page.getByRole('button', { name: /Kırtasiye/ }).click();
  await sheet(page, 'Kategoriler').getByRole('button', { name: 'Gizle' }).click();
  await visible(page.locator('.rows li.off', { hasText: 'Kırtasiye' }).getByText('Gizli'), 'marked Gizli');
  const add = await openAdd(page);
  assert((await add.getByRole('button', { name: 'Kırtasiye' }).count()) === 0, 'hidden category not offered for new txns');
  await page.keyboard.press('Escape');
  await tab(page, 'İşlemler');
  await page.getByRole('button', { name: /Defter/ }).click();
  await visible(sheet(page, 'İşlemi düzenle').getByRole('button', { name: 'Kırtasiye' }), 'hidden category still shown when editing its txn');
  await page.keyboard.press('Escape');
  // income category add + delete unused
  await tab(page, 'Ayarlar');
  await page.getByRole('tab', { name: 'Gelir' }).click();
  await page.getByRole('button', { name: /Kategori ekle/ }).click();
  dlg = sheet(page, 'Kategoriler');
  await dlg.getByLabel('Ad (EN)').fill('Freelance');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await visible(page.locator('.row-name', { hasText: 'Freelance' }), 'income cat listed (TR name falls back to EN)');
  await page.getByRole('button', { name: /Freelance/ }).click();
  await sheet(page, 'Kategoriler').getByRole('button', { name: 'Sil' }).click();
  await hidden(page.locator('.row-name', { hasText: 'Freelance' }), 'unused category deleted');
});

tc('TC34', 'Ayarlar', 'Sync panel renders; invalid Supabase URL/key is rejected', async ({ page }) => {
  await tab(page, 'Ayarlar');
  await visible(page.getByText('Veriler yalnızca bu telefonda saklanıyor.'), 'local mode text');
  if (!(await page.getByText('Eşitlemeyi kur').count())) {
    // Build has the household Supabase project built in: the panel goes straight to sign-in.
    await visible(page.getByLabel('E-posta'), 'sign-in email field');
    await visible(page.getByRole('button', { name: 'Hesap oluştur' }), 'create account button');
    await noHorizontalOverflow(page, 'sync panel sign-in');
    return;
  }
  await page.getByText('Eşitlemeyi kur').click();
  await page.getByLabel('Supabase proje adresi').fill('http://not-secure.example.com');
  await page.getByLabel('Supabase anon anahtarı').fill('kisa');
  await page.getByRole('button', { name: 'Bağlan' }).click();
  await toastHas(page, 'Bir hata oluştu', 'error toast for bad URL');
  await page.getByLabel('Supabase proje adresi').fill('not a url');
  await page.getByLabel('Supabase anon anahtarı').fill('x'.repeat(40));
  await page.getByRole('button', { name: 'Bağlan' }).click();
  await toastHas(page, 'URL / key', 'error toast for malformed URL');
  await visible(page.getByLabel('Supabase proje adresi'), 'still on setup form');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert(!keys.some((k) => /cloud|supa/i.test(k)), `no cloud config should be stored: ${keys}`);
  await noHorizontalOverflow(page, 'sync panel open');
});

tc('TC35', 'Yedek', 'Download backup JSON contains all data', async ({ page }) => {
  await addTxn(page, { amount: '77,7', note: 'Yedeklenecek' });
  await tab(page, 'Ayarlar');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Yedeği indir/ }).click()]);
  assert(/^budget-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), `file name ${dl.suggestedFilename()}`);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  fs.copyFileSync(await dl.path(), path.join(TMP, 'backup.json'));
  assert(j.txns.length === 1 && j.txns[0].amount === 77.7 && j.categories.length > 10 && j.people.length === 2 && j.cards.length >= 5, 'backup content');
});

tc('TC36', 'Yedek', 'Restore a backup replaces data; broken/invalid backup is rejected', async ({ page }) => {
  const backup = { categories: [{ id: 'other', name_en: 'Other', name_tr: 'Diğer', icon: '📦', color: '#BAB0AC', kind: 'expense' }, { id: 'other_income', name_en: 'Other Income', name_tr: 'Diğer Gelir', icon: '💰', color: '#BAB0AC', kind: 'income' }],
    people: [{ id: 'p1', name: 'Yedek Kişi', color: '#4E79A7' }], cards: [], rules: [],
    txns: [{ id: 'r1', kind: 'expense', amount: 555, date: TODAY, category_id: 'other', person_id: 'p1', card_id: null, note: 'Yedekten', source: 'manual', import_id: null, created_at: new Date().toISOString() }] };
  const f = path.join(TMP, 'restore.json'); fs.writeFileSync(f, JSON.stringify(backup));
  await addTxn(page, { amount: '1', note: 'Silinmeli' });
  await tab(page, 'Ayarlar');
  const input = page.locator('input[type=file][accept*="json"]');
  await input.setInputFiles(FILES.badJson);
  await toastHas(page, 'Bir hata oluştu', 'broken JSON error');
  await input.setInputFiles(FILES.wrongJson);
  await toastHas(page, 'invalid backup', 'wrong-shape JSON error');
  assert((await txns(page)).some((x) => x.note === 'Silinmeli'), 'data unchanged after failed restores');
  await input.setInputFiles(f);
  await toastHas(page, 'Kaydedildi', 'restore success');
  const t = await txns(page);
  assert(t.length === 1 && t[0].note === 'Yedekten', `after restore: ${JSON.stringify(t.map((x) => x.note))}`);
  await page.reload(); await page.locator('nav.tabbar').waitFor();
  await tab(page, 'İşlemler');
  await visible(page.getByRole('button', { name: /Yedekten/ }), 'restored txn after reload');
  await visible(page.locator('.chips').getByRole('button', { name: 'Yedek Kişi' }).or(page.getByRole('button', { name: /Yedek Kişi/ })), 'restored person');
}, { allowConsole: [/Failed to load resource/] });

tc('TC37', 'Yedek', 'CSV export has header, all rows and escapes quotes', async ({ page }) => {
  await addTxn(page, { amount: '1.234,56', cat: 'Market', note: 'Ali "Usta" Bakkal, Kadıköy' });
  await addTxn(page, { amount: '5000', kind: 'income', cat: 'Maaş' });
  await tab(page, 'Ayarlar');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /dışa aktar/ }).click()]);
  assert(dl.suggestedFilename().endsWith('.csv'), 'csv file');
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  const lines = txt.replace(/^﻿/, '').split('\n');
  assert(lines[0] === 'Tarih;Tür;Tutar;Kategori;Kişi;Ödeme;Not', `header "${lines[0]}"`);
  assert(lines.length === 3, `expected 3 lines, got ${lines.length}`);
  assert(txt.includes('1234,56') && txt.includes(';Gelir;5000,00;') && txt.includes('"Ali ""Usta"" Bakkal, Kadıköy"') && txt.includes('"Market"'), `csv content: ${txt}`);
});

tc('TC38', 'Yedek', 'Load demo data, then "Tüm verileri sil" resets to defaults', async ({ page }) => {
  await loadDemo(page);
  assert((await txns(page)).length > 50, 'demo data loaded');
  await expectText(stat(page, 'Gelir'), '₺157.000', 'demo income this month');
  await tab(page, 'Ayarlar');
  await page.getByRole('button', { name: /Tüm verileri sil/ }).click();
  await toastHas(page, 'Silindi');
  const d = await data(page);
  assert(d.txns.length === 0 && d.categories.length > 10 && d.people.length === 2, 'reset keeps defaults, removes txns');
  await tab(page, 'Özet');
  await visible(page.getByText('Henüz kayıt yok'), 'empty state after reset');
});

tc('TC39', 'Yedek', 'Cancelling the delete-all confirmation keeps data', async ({ page }) => {
  await addTxn(page, { amount: '5', note: 'Kalsın' });
  await tab(page, 'Ayarlar');
  page.removeAllListeners('dialog');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: /Tüm verileri sil/ }).click();
  await page.waitForTimeout(400);
  page.on('dialog', (d) => d.accept());
  assert((await txns(page)).length === 1, 'data kept after cancel');
});

// ===== Statements
tc('TC40', 'Ekstreler', 'Yapı Kredi credit-card PDF: preview, detection, credits unticked, categories, installment', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.cardPdf);
  await waitPreview(page);
  await expectText(page.getByRole('heading', { name: /işlem bulundu/ }), `${CARD_ROWS.length} işlem bulundu`, 'row count');
  await expectText(page.locator('.badge'), 'Yapı Kredi · Kart ekstresi', 'bank badge');
  assert((await page.getByLabel('Kart / hesap').inputValue()) === 'c-yk-p2', 'Yapı Kredi card auto-selected');
  const items = page.locator('ul.preview li');
  const off = await page.locator('ul.preview li.off').count();
  assert(off === 2, `2 credits (payment, refund) should be unticked, got ${off}`);
  const trendyol = items.filter({ hasText: 'TRENDYOL' });
  await expectText(trendyol, 'Taksit 2/6', 'installment shown');
  const cat = async (txt) => (await items.filter({ hasText: txt }).getByLabel('Kategori').inputValue());
  const cats = { m: await cat('MIGROS'), y: await cat('YEMEKSEPETI'), s: await cat('SHELL'), t: await cat('TRENDYOL'), e: await cat('ECZANE'), n: await cat('NETFLIX') };
  await expectText(importBtn(page), `6 işlemi kaydet · ${tl(CARD_EXPENSE_TOTAL)}`, 'import button');
  await noHorizontalOverflow(page, 'import preview');
  await importBtn(page).click();
  await toastHas(page, '6 işlem kaydedildi');
  const all = await txns(page);
  const t = all.filter((x) => !x.projected);
  assert(t.length === 6 && t.every((x) => x.card_id === 'c-yk-p2' && x.person_id === 'p2' && x.source === 'import' && x.import_id === t[0].import_id), 'imported rows linked to card/person/import');
  const planned = all.filter((x) => x.projected);
  assert(planned.length === 4 && planned.every((x) => x.import_id === t[0].import_id && /TRENDYOL/.test(x.note)), `installments 3..6 of 2/6 planned ahead, got ${planned.length}`);
  assert(t.find((x) => /TRENDYOL/.test(x.note))?.note.includes('(2/6)'), 'installment kept in note');
  await visible(page.locator('ul.imports li', { hasText: 'Yapı Kredi Kart' }), 'listed under Önceki yüklemeler');
  // checked last so the rest of the flow is still exercised
  assert(cats.m === 'groceries' && cats.y === 'dining' && cats.s === 'transport' && cats.t === 'shopping' && cats.e === 'health' && cats.n === 'subscriptions', `suggested categories ${JSON.stringify(cats)} (expected TRENDYOL → shopping)`);
}, { shot: true });

tc('TC41', 'Ekstreler', 'Garanti account PDF: salary, card payment, investment, transfer, fees', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.accPdf);
  await waitPreview(page);
  await expectText(page.getByRole('heading', { name: /işlem bulundu/ }), `${ACC_ROWS.length} işlem bulundu`, 'row count');
  await expectText(page.locator('.badge'), 'Garanti BBVA · Hesap hareketleri', 'bank badge');
  assert((await page.getByLabel('Kart / hesap').inputValue()) === 'a-garanti-p1', 'Garanti Hesap auto-selected');
  await visible(page.getByText(/Çift sayılmaması için 3/), '3 rows unticked notice');
  const items = page.locator('ul.preview li');
  const row = (txt) => items.filter({ has: page.getByRole('checkbox', { name: txt }) });
  const checked = async (txt) => row(txt).getByRole('checkbox').isChecked();
  await expectText(row('MAAŞ'), '+₺45.000,00', 'salary is income');
  assert((await row('MAAŞ').getByLabel('Kategori').inputValue()) === 'salary', 'salary category');
  assert(await checked('MAAŞ'), 'salary ticked');
  await expectText(row('K.Kartı'), 'Kart ödemesi', 'card-payment flag'); assert(!(await checked('K.Kartı')), 'card payment unticked');
  await expectText(row('FON SATIŞ'), 'Yatırım / birikim', 'investment flag'); assert(!(await checked('FON SATIŞ')), 'investment unticked');
  await expectText(row('DENEME KİŞİ'), 'Transfer', 'transfer flag'); assert(!(await checked('DENEME KİŞİ')), 'transfer unticked');
  assert(await checked('AİDAT'), 'AİDAT transfer kept (bill)');
  assert((await row('AİDAT').getByLabel('Kategori').inputValue()) === 'bills', 'AİDAT → Faturalar');
  assert((await row('İŞLETİM').getByLabel('Kategori').inputValue()) === 'fees', 'account fee → Banka Masrafları');
  assert((await row('EFT KOMİSYONU').getByLabel('Kategori').inputValue()) === 'fees', 'EFT fee → Banka Masrafları');
  await expectText(row('ENERJISA'), '−₺1.234,56', 'signed amount parsed');
  assert(!(await row('ENERJISA').innerText()).includes('32.176'), 'running balance must not be used as amount');
  await expectText(importBtn(page), '5 işlemi kaydet', 'import button count');
  await importBtn(page).click();
  await toastHas(page, '5 işlem kaydedildi');
  await tab(page, 'Özet');
  await page.getByRole('button', { name: 'previous month' }).click();
  await expectText(stat(page, 'Gelir'), '₺45.000', 'salary counted as income');
  await expectText(stat(page, 'Gider'), tl(2000 + 1234.56 + 8.5 + 25, true), 'expenses exclude card payment/transfer');
}, { shot: true });

tc('TC42', 'Ekstreler', 'CSV import (semicolon, BOM, Turkish decimals), select all/none, category change is learned', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.csv);
  await waitPreview(page);
  await expectText(page.getByRole('heading', { name: /işlem bulundu/ }), '5 işlem bulundu', 'row count');
  const items = page.locator('ul.preview li');
  await expectText(items.filter({ hasText: 'A101' }), '−₺1.234,56', 'Turkish decimal amount');
  assert((await page.locator('ul.preview li.off').count()) === 1, 'payment row unticked');
  await expectText(importBtn(page), '4 işlemi kaydet', '4 selected');
  await page.getByRole('button', { name: 'Hiçbirini seçme' }).click();
  await expectText(importBtn(page), '0 işlemi kaydet', '0 selected');
  assert(await importBtn(page).isDisabled(), 'import disabled with nothing selected');
  await page.getByRole('button', { name: 'Tümünü seç' }).click();
  await expectText(importBtn(page), '5 işlemi kaydet', '5 selected');
  await page.getByRole('checkbox', { name: /ÖDEME - TEŞEKKÜR/ }).uncheck();
  await items.filter({ hasText: 'ACME' }).getByLabel('Kategori').selectOption('shopping');
  await importBtn(page).click();
  await toastHas(page, '4 işlem kaydedildi');
  const d = await data(page);
  assert(d.txns.find((x) => /ACME/.test(x.note))?.category_id === 'shopping', 'changed category saved');
  assert(d.rules.some((r) => r.category_id === 'shopping' && /acme/.test(r.key)), `rule learned: ${JSON.stringify(d.rules)}`);
  // learned rule applied to next file with same merchant
  const f2 = path.join(TMP, 'acme2.csv');
  fs.writeFileSync(f2, `Tarih;Açıklama;Tutar\n${trd(prevMonthDate(20))};ACME DENEME MAĞAZASI;12,34\n`);
  await upload(page, f2);
  await waitPreview(page);
  assert((await page.locator('ul.preview li').first().getByLabel('Kategori').inputValue()) === 'shopping', 'learned category suggested next time');
});

tc('TC43', 'Ekstreler', 'Duplicate import: same file again → rows marked "Zaten yüklendi" and unticked', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.csv);
  await waitPreview(page);
  await importBtn(page).click();
  await toastHas(page, '4 işlem kaydedildi');
  await upload(page, FILES.csv);
  await waitPreview(page);
  await visible(page.getByText('Daha önce yüklenmiş 4 işlem işaretsiz'), 'duplicate notice');
  assert((await page.locator('ul.preview li', { hasText: 'Zaten yüklendi' }).count()) === 4, '4 rows tagged duplicate');
  assert(await importBtn(page).isDisabled(), 'nothing to import');
  assert((await txns(page)).length === 4, 'no duplicates stored');
}, { shot: true });

tc('TC44', 'Ekstreler', 'Duplicate detection also works for PDF re-import and when user picks the same card manually', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.cardPdf);
  await waitPreview(page);
  await importBtn(page).click();
  await toastHas(page, 'işlem kaydedildi');
  await page.getByLabel('Kart / hesap').selectOption({ index: 0 });
  await upload(page, FILES.cardPdf);
  await waitPreview(page);
  await visible(page.getByText(/Daha önce yüklenmiş 6 işlem/), 'duplicates detected after auto-switching to the Yapı Kredi card');
});

tc('TC45', 'Ekstreler', 'Undo an import removes exactly its transactions', async ({ page }) => {
  await addTxn(page, { amount: '10', note: 'Elle eklenen' });
  await tab(page, 'Ekstreler');
  await upload(page, FILES.csv);
  await waitPreview(page);
  await importBtn(page).click();
  await toastHas(page, 'işlem kaydedildi');
  const li = page.locator('ul.imports li');
  await expectText(li.first(), '· 4 ·', 'import summary shows 4 rows');
  await li.first().getByRole('button', { name: 'Bu yüklemeyi geri al' }).click();
  await toastHas(page, 'Silindi');
  await hidden(li, 'import removed from list');
  const t = await txns(page);
  assert(t.length === 1 && t[0].note === 'Elle eklenen', `only manual txn should remain: ${JSON.stringify(t.map((x) => x.note))}`);
  // after undo the same file can be imported again (no false duplicates)
  await upload(page, FILES.csv);
  await waitPreview(page);
  await expectText(importBtn(page), '4 işlemi kaydet', 're-import possible after undo');
});

tc('TC46', 'Ekstreler', 'Invalid files: junk CSV, empty CSV, corrupt PDF show a friendly message', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.junkCsv);
  await visible(page.getByText('Bu dosyadan işlem okunamadı'), 'junk CSV → no rows message', 10000);
  await upload(page, FILES.emptyCsv);
  await visible(page.getByText('Bu dosyadan işlem okunamadı'), 'empty CSV → no rows message', 10000);
  await upload(page, FILES.brokenPdf);
  await visible(page.getByText('Bu dosyadan işlem okunamadı'), 'corrupt PDF → no rows message', 10000);
  await visible(page.getByRole('status').filter({ hasText: 'Bir hata oluştu' }), 'corrupt PDF → error toast');
  assert(!(await page.locator('label[for="stmt-file"]').innerText()).includes('okunuyor'), 'busy state cleared');
  assert((await txns(page)).length === 0, 'nothing imported');
}, { shot: true, allowConsole: [/./] }); // Import.tsx logs the parse exception on purpose

tc('TC47', 'Ekstreler', 'Imported card statement shows correctly in Summary pie + paid-with and in English', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.cardPdf);
  await waitPreview(page);
  await importBtn(page).click();
  await toastHas(page, 'işlem kaydedildi');
  await tab(page, 'Özet');
  await page.getByRole('button', { name: 'previous month' }).click();
  await expectText(stat(page, 'Gider'), tl(CARD_EXPENSE_TOTAL, true), 'expense tile');
  await expectText(page.locator('section.card', { has: page.getByRole('heading', { name: 'Ödeme şekli' }) }), 'Yapı Kredi Kart · Eşim', 'paid with Yapı Kredi');
  await page.locator('.chips').getByRole('button', { name: 'Ben' }).click();
  await expectText(stat(page, 'Gider'), '₺0', 'imported rows belong to card owner Eşim');
  await tab(page, 'Ayarlar');
  await page.getByRole('tab', { name: 'English' }).click();
  await page.locator('nav.tabbar').getByRole('button', { name: 'Statements', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Previous imports' }), 'Statements in English');
  await noHorizontalOverflow(page, 'Statements (EN)');
});

tc('TC48', 'İşlemler', 'Search by amount typed the Turkish way ("1.234,56" and "250,5")', async ({ page }) => {
  await addTxn(page, { amount: '1.234,56', note: 'Tutar arama' });
  await addTxn(page, { amount: '250,5', note: 'Küsuratlı' });
  await tab(page, 'İşlemler');
  const search = page.getByLabel('Ara');
  await search.fill('1234');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, '"1234" should find the 1.234,56 row');
  await search.fill('1.234,56');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, 'searching "1.234,56" (as shown in the list) should find the row');
  await search.fill('250,5');
  await eventually(async () => (await page.locator('button.txn').count()) === 1, 'searching "250,5" should find the row');
});

tc('TC49', 'Ekstreler', 'Re-categorising an imported transaction teaches the importer', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.csv);
  await waitPreview(page);
  await importBtn(page).click();
  await toastHas(page, 'işlem kaydedildi');
  await tab(page, 'İşlemler');
  await page.getByRole('button', { name: 'month', exact: true }).click(); // all months
  await page.getByRole('button', { name: /ACME DENEME/ }).click();
  const dlg = sheet(page, 'İşlemi düzenle');
  await dlg.getByRole('button', { name: 'Hediye' }).click();
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'edit closes');
  const rules = (await data(page)).rules;
  assert(rules.some((r) => r.category_id === 'gifts' && /acme/.test(r.key)), `rule stored: ${JSON.stringify(rules)}`);
  const f2 = path.join(TMP, 'acme3.csv');
  fs.writeFileSync(f2, `Tarih;Açıklama;Tutar\n${trd(prevMonthDate(21))};ACME DENEME MAĞAZASI;55,00\n`);
  await tab(page, 'Ekstreler');
  await upload(page, f2);
  await waitPreview(page);
  assert((await page.locator('ul.preview li').first().getByLabel('Kategori').inputValue()) === 'gifts', 'learned category suggested');
});

tc('TC50', 'Ekstreler', 'Account PDF where long descriptions wrap onto two lines (Garanti style) keeps every row', async ({ page }) => {
  await tab(page, 'Ekstreler');
  await upload(page, FILES.wrapPdf);
  await waitPreview(page);
  await expectText(page.getByRole('heading', { name: /işlem bulundu/ }), `${WRAP_ROWS.length} işlem bulundu`, 'all rows found (none silently dropped)');
  await visible(page.getByRole('checkbox', { name: /AİDAT/ }), 'wrapped AİDAT row present');
  await expectText(page.locator('ul.preview li', { has: page.getByRole('checkbox', { name: /AİDAT/ }) }), '−₺2.000,00', 'wrapped row amount');
}, { shot: true });

tc('TC51', 'Ekstreler', 'Password-protected PDF asks for the password, rejects a wrong one, opens with the right one', async ({ page }) => {
  if (!fs.existsSync(FILES.lockedPdf)) return 'skip: python3 + pypdf not available to create an encrypted PDF';
  await tab(page, 'Ekstreler');
  await upload(page, FILES.lockedPdf);
  await visible(page.getByText('Bu PDF şifreli'), 'password prompt', 15000);
  await page.getByLabel('password').fill('000000');
  await page.getByRole('button', { name: 'Aç' }).click();
  await visible(page.getByText('Şifre yanlış'), 'wrong password message', 15000);
  await page.getByLabel('password').fill('123456');
  await page.getByRole('button', { name: 'Aç' }).click();
  await waitPreview(page);
  await expectText(page.getByRole('heading', { name: /işlem bulundu/ }), `${CARD_ROWS.length} işlem bulundu`, 'rows after unlock');
});

tc('TC53', 'Ev ortak', 'Ev Faturaları turns on the shared switch; Ev chip shows only shared expenses', async ({ page }) => {
  let dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('900');
  await dlg.getByRole('button', { name: 'Ev Faturaları' }).click();
  await dlg.getByLabel(/Ev ortak gideri/).waitFor();
  for (let i = 0; i < 20 && !(await dlg.getByLabel(/Ev ortak gideri/).isChecked()); i++) await page.waitForTimeout(50);
  assert(await dlg.getByLabel(/Ev ortak gideri/).isChecked(), 'shared switch on for Ev Faturaları');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet closes');
  dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('300');
  await dlg.getByRole('button', { name: 'Yeme & İçme' }).click();
  assert(!(await dlg.getByLabel(/Ev ortak gideri/).isChecked()), 'shared switch off for dining');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet closes');
  await expectText(stat(page, 'Gider'), '₺1.200', 'everyone total');
  await page.getByRole('button', { name: /Ev$/ }).first().click();
  await expectText(stat(page, 'Gider'), '₺900', 'Ev total only shared');
  await page.getByRole('button', { name: /Ben$/ }).first().click();
  await expectText(stat(page, 'Gider'), '₺300', 'Ben total leaves the Ev expense out');
  await tab(page, 'İşlemler');
  await page.getByRole('button', { name: /Ev$/ }).first().click();
  assert((await page.locator('.txn').count()) === 1, 'Transactions Ev chip lists only the shared row');
  await tab(page, 'Özet');
  const t = await txns(page);
  assert(t.find((x) => x.amount === 900).shared === true && !t.find((x) => x.amount === 300).shared, 'shared flag stored');
}, { shot: true });

tc('TC54', 'Kredi', 'Repeat monthly plans the next months as Planlanan', async ({ page }) => {
  const dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('12500');
  await dlg.getByRole('button', { name: 'Kredi Ödemeleri' }).click();
  await dlg.getByLabel('Kaç ay daha').selectOption('3');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet closes');
  await toastHas(page, '3 gelecek ödeme planlandı');
  const t = await txns(page);
  assert(t.length === 4 && t.filter((x) => x.projected).length === 3 && new Set(t.map((x) => x.date.slice(0, 7))).size === 4, `4 rows in 4 months: ${JSON.stringify(t.map((x) => [x.date, x.projected]))}`);
});

tc('TC55', 'Kredi', 'Series length can be changed later from the first payment', async ({ page }) => {
  let dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('2000');
  await dlg.getByRole('button', { name: 'Kira & Ev' }).click();
  await dlg.getByLabel('Not (isteğe bağlı)').fill('Aidat');
  await dlg.getByLabel('Kaç ay daha').selectOption('3');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet closes');
  await tab(page, 'İşlemler');
  await page.getByRole('button', { name: /Aidat/ }).first().click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/toplam kaç ay/).selectOption('6');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet closes');
  let t = await txns(page);
  assert(t.length === 6 && new Set(t.map((x) => x.inst_no)).size === 6 && t.every((x) => x.shared), `6 months, all Ev: ${JSON.stringify(t.map((x) => [x.inst_no, x.date, x.shared]))}`);
  await page.getByRole('button', { name: /Aidat/ }).first().click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/toplam kaç ay/).selectOption('2');
  await dlg.getByRole('button', { name: 'Kaydet' }).click();
  await hidden(dlg, 'sheet closes');
  t = await txns(page);
  assert(t.length === 2, `shortened to 2: ${t.length}`);
});

tc('TC56', 'Alışveriş listesi', 'Add "süt, ekmek", tick one, clear bought; fits 393px', async ({ page }) => {
  await tab(page, 'Liste');
  await visible(page.getByText('Liste boş'), 'empty state');
  await page.getByLabel('Listeye ekle').first().fill('süt, ekmek');
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await visible(page.getByText('ekmek'), 'ekmek listed');
  let s = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-data-v1')).shopping);
  assert(s.length === 2 && s.every((x) => !x.done), `2 open items: ${JSON.stringify(s)}`);
  await page.getByText('süt').click();
  await visible(page.getByRole('heading', { name: /Alındı/ }), 'bought section');
  s = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-data-v1')).shopping);
  assert(s.find((x) => x.name === 'süt').done === true, 'süt marked done');
  await noHorizontalOverflow(page, 'shopping tab');
  await page.getByRole('button', { name: 'Temizle' }).click();
  await page.waitForTimeout(300);
  s = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-data-v1')).shopping);
  assert(s.length === 1 && s[0].name === 'ekmek', `bought item cleared: ${JSON.stringify(s)}`);
  // wishlist with a rough price
  await page.getByRole('tab', { name: /İstekler/ }).click();
  await visible(page.getByText('Liste boş'), 'wishlist empty');
  await page.getByLabel('Listeye ekle').first().fill('Robot süpürge');
  await page.getByLabel('₺ fiyat').fill('15.000');
  await page.getByRole('button', { name: 'Listeye ekle' }).click();
  await visible(page.getByText('Robot süpürge'), 'wish item');
  await expectText(page.locator('.shop-total'), '15.000', 'wishlist total');
  assert(!(await page.getByText('ekmek').isVisible()), 'daily item not on the wishlist');
  s = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-data-v1')).shopping);
  assert(s.find((x) => x.name === 'Robot süpürge').list === 'wish' && s.find((x) => x.name === 'Robot süpürge').price === 15000, 'stored on wish list with price');
  await noHorizontalOverflow(page, 'wishlist');
}, { shot: true });

tc('TC52', 'Düzen', 'Very long number typed in the amount field does not push the sheet wider than 393px', async ({ page }) => {
  const dlg = await openAdd(page);
  await dlg.getByLabel('Tutar').fill('123456789012345678,99');
  await noHorizontalOverflow(page, 'add sheet with a 21-character amount');
}, { shot: true });

// ---------------------------------------------------------------- runner
function startPreview() {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '';
    const onData = (b) => { out += b; if (out.includes(String(PORT))) resolve(p); };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('exit', (c) => reject(new Error('vite preview exited ' + c + '\n' + out)));
    setTimeout(() => reject(new Error('vite preview did not start\n' + out)), 30000);
  });
}
function stopPreview(p) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* already gone */ } }

async function waitHttp(url, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('server not reachable: ' + url);
}

const results = [];
let server;
let browser;
try {
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('dist/ missing: run `npx vite build` first');
  server = await startPreview();
  await waitHttp(BASE);
  browser = await chromium.launch();
  await makeFiles(browser);
  const selected = FILTER.length ? cases.filter((c) => FILTER.some((f) => c.id === f || c.id.startsWith(f))) : cases;
  for (const c of selected) {
    const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], acceptDownloads: true, locale: 'tr-TR', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(c.opts.ctx || {}) });
    await ctx.addInitScript(() => { window.__E2E_NATIVE_CONFIRM = true; });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const consoleErrors = [];
    const allow = c.opts.allowConsole || [];
    page.on('console', (m) => { if (m.type() === 'error' && !allow.some((re) => re.test(m.text()))) consoleErrors.push('console.error: ' + m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    page.on('dialog', (d) => d.accept());
    const t0 = Date.now();
    let status = 'pass', error = '', shot = '';
    try {
      await page.goto(BASE);
      await page.locator('nav.tabbar').waitFor();
      const ret = await c.fn({ page, ctx });
      if (typeof ret === 'string' && ret.startsWith('skip')) { status = 'skip'; error = ret; }
      await page.waitForTimeout(150);
      if (consoleErrors.length) throw new AssertError('Console errors: ' + consoleErrors.join(' | '));
      if (c.opts.shot) { shot = `${c.id}-pass.png`; await page.screenshot({ path: path.join(REPORT, shot), fullPage: true }); }
    } catch (e) {
      status = 'fail';
      error = (e instanceof AssertError ? '' : '[test error] ') + String(e.message || e).split('\n').slice(0, 3).join(' ');
      if (consoleErrors.length && !error.includes('Console errors')) error += ' || Console errors: ' + consoleErrors.join(' | ');
      shot = `${c.id}-fail.png`;
      try { await page.screenshot({ path: path.join(REPORT, shot), fullPage: true }); } catch { shot = ''; }
    }
    const ms = Date.now() - t0;
    results.push({ id: c.id, area: c.area, title: c.title, status, error, screenshot: shot, ms });
    console.log(`${status.toUpperCase()} ${c.id} ${c.title} (${ms}ms)${error ? '\n     ' + error : ''}`);
    await ctx.close();
  }
} catch (e) {
  console.error('Suite aborted:', e);
  process.exitCode = 2;
} finally {
  await browser?.close();
  if (server) stopPreview(server);
}

const passed = results.filter((r) => r.status === 'pass').length;
const skipped = results.filter((r) => r.status === 'skip').length;
const failed = results.length - passed - skipped;
fs.writeFileSync(path.join(REPORT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), total: results.length, passed, failed, skipped, results }, null, 2));
fs.writeFileSync(path.join(REPORT, 'results.md'), `# E2E results (${new Date().toISOString()})\n\nTotal ${results.length} · Passed ${passed} · Failed ${failed} · Skipped ${skipped}\n\n| ID | Area | Case | Result | Error | Screenshot |\n|---|---|---|---|---|---|\n` +
  results.map((r) => `| ${r.id} | ${r.area} | ${r.title} | ${r.status.toUpperCase()} | ${r.error.replace(/\|/g, '\\|')} | ${r.screenshot} |`).join('\n') + '\n');
console.log(`\nTotal ${results.length}  Passed ${passed}  Failed ${failed}  Skipped ${skipped}\nReport: ${path.relative(ROOT, REPORT)}/results.md`);
if (failed && !process.exitCode) process.exitCode = 1;
