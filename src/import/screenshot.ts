import { parseAmount } from '../lib/money';
import { isoDate } from '../lib/dates';
import { fold } from '../lib/text';
import { cleanDescription, detectBank, type Line, type ParsedRow, type ParseResult } from './parse';

/**
 * Bank-app screenshots (OCR text): transaction lists with date headers ("8 Kasım 2026", "Bugün"),
 * a merchant line with the amount on the right, and optional detail lines ("6 Taksit", "İade").
 * Charges count as provisional expenses until the statement arrives.
 */
const TR_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
// OCR often reads "+" as "*" or "t"; "−" (U+2212) and "–" are minus signs in some apps.
const MONEY = /([-−–+*]?)\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?!\d)\s?(?:TL|TRY|₺|t)?/g;
const SKIP = /(\bbonus\b|\bmil\b|bakiye|limit|toplam|asgari|son odeme|hesap kesim|donem borcu|ekstre borcu|kullanilabilir|puan|bonus kazan|chip-?para kazan|kalan borc|guncel borc|doneme ait)/;
const CREDIT = /(iade|iptal|odeme(niz)? alindi|odemeniz icin tesekkur|borc odeme|kart odeme|hesaptan odeme|tahsilat|cashback|indirim)/;
const PAYMENT = /(odeme(niz)? alindi|borc odeme|kart odeme|hesaptan odeme|otomatik odeme|tahsilat)/;

function monthIndex(word: string): number {
  const w = fold(word).replace(/[^a-z]/g, '');
  if (w.length < 3) return -1;
  return TR_MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)) && (w.length <= m.length ? m.startsWith(w) || w.startsWith(m.slice(0, 3)) : w.startsWith(m)));
}

/** Year for a date shown without one: the latest such date that is not in the future. */
function guessYear(month: number, day: number, today: string): number {
  const y = +today.slice(0, 4);
  const iso = isoDate(y, month, day);
  return iso && iso > today ? y - 1 : y;
}

/** A date anywhere in the line: "8 Kasım 2026", "8 Kasım", "08.11.2026", "08/11", "Bugün", "Dün". */
export function findDate(text: string, today: string): { iso: string; index: number; length: number } | null {
  const f = fold(text);
  let m = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const iso = isoDate(y, +m[2], +m[1]); if (iso) return { iso, index: m.index!, length: m[0].length }; }
  m = text.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3,9})\.?(?:\s+(\d{4}))?/);
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) {
      const y = m[3] ? +m[3] : guessYear(mi + 1, +m[1], today);
      const iso = isoDate(y, mi + 1, +m[1]);
      if (iso) return { iso, index: m.index!, length: m[0].length };
    }
  }
  m = text.match(/\b(\d{1,2})[./](\d{1,2})\b(?![./]\d)/);
  if (m && +m[2] >= 1 && +m[2] <= 12) { const iso = isoDate(guessYear(+m[2], +m[1], today), +m[2], +m[1]); if (iso) return { iso, index: m.index!, length: m[0].length }; }
  const d = new Date(today + 'T12:00:00');
  if (/\bbugun\b/.test(f)) return { iso: today, index: f.indexOf('bugun'), length: 5 };
  if (/\bdun\b/.test(f)) { d.setDate(d.getDate() - 1); return { iso: d.toISOString().slice(0, 10), index: f.indexOf('dun'), length: 3 }; }
  return null;
}

/** OCR slips in amounts: "69.63742 TL" (lost comma) → "69.637,42 TL". */
export function fixOcrMoney(text: string): string {
  return text.replace(/(\d{1,3}(?:\.\d{3})*\.\d{3})(\d{2})(?=\s?(?:TL|₺)\b)/g, '$1,$2');
}

/** Bank app category labels (Garanti and others) → our categories. */
const BANK_CATS: [RegExp, string][] = [
  [/^market|gida|supermarket/, 'groceries'], [/akaryakit|ulasim|otopark|taksi/, 'transport'], [/yeme|icme|restoran|kafe/, 'dining'],
  [/giyim|aksesuar|elektronik|alisveris|mobilya|dekorasyon/, 'shopping'], [/saglik|eczane|kozmetik/, 'health'], [/egitim|kirtasiye/, 'education'],
  [/eglence|sinema|kultur/, 'entertainment'], [/seyahat|turizm|otel|havayolu/, 'travel'], [/fatura|telekom|iletisim/, 'bills'],
  [/kisisel bakim|kuafor/, 'personal'], [/evcil/, 'pets'], [/yapi market|ev esya|ev gerec/, 'home_shopping'],
];
function bankCategory(label: string): string | null {
  const f = fold(label);
  for (const [re, id] of BANK_CATS) if (re.test(f)) return id;
  return null;
}

/**
 * Garanti BBVA style: the day leads the row, month and year sit under it, the merchant is under the
 * category: "28 Market -455,00 TL" / "Eki >" / "2026 ARDA BAKEHOUSE" (the year may come out as "2028").
 */
function parseDayBlocks(lines: string[], today: string): (ParsedRow & { _i: number })[] | null {
  const rows: (ParsedRow & { _i: number })[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{1,2})\s+(.+?)\s+([-−–+*]?)\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s?(?:TL|₺)?\s*>?$/);
    if (!m || +m[1] < 1 || +m[1] > 31) continue;
    let month = -1, merchant = '', year: number | null = null, extra = '';
    for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
      const t = lines[j].replace(/[>›»]/g, ' ').trim();
      if (/^(\d{1,2})\s+.+\d[.,]\d{2}/.test(t)) break; // next row
      const mm = t.match(/^([A-Za-zÇĞİÖŞÜçğıöşü]{3,9})\.?\b/);
      if (month < 0 && mm && monthIndex(mm[1]) >= 0 && t.length <= 14) { month = monthIndex(mm[1]); continue; }
      const ym = t.match(/^(20\d\d)\s*(.*)$/);
      if (ym && !merchant) { year = +ym[1]; merchant = ym[2]; continue; }
      if (!merchant && month >= 0 && !/bonus|mil\b|puan/i.test(t)) { merchant = t; continue; }
      if (merchant) extra += ' ' + t;
    }
    if (month < 0) continue;
    const ty = +today.slice(0, 4);
    const y = year && (year === ty || year === ty - 1) ? year : guessYear(month + 1, +m[1], today);
    const date = isoDate(y, month + 1, +m[1]);
    const amount = parseAmount(m[4]);
    if (!date || !amount) continue;
    const label = m[2].trim();
    const desc = (merchant || label).trim();
    const fd = fold(desc + ' ' + label + extra);
    const inst = (desc + extra).match(/\(?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)?/);
    const credit = m[3] === '+' || m[3] === '*' || CREDIT.test(fd);
    rows.push({
      date, description: cleanDescription(desc.replace(/\(?\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)?/, ' ')) || label, amount, kind: credit ? 'income' : 'expense',
      flag: credit ? (PAYMENT.test(fd) ? 'cardpay' : 'refund') : null, hint: null,
      installment: inst && +inst[1] <= +inst[2] && +inst[2] > 1 ? `${+inst[1]}/${+inst[2]}` : null, bankCat: bankCategory(label), _i: i,
    });
  }
  return rows.length ? rows : null;
}

export function parseScreenshotLines(input: Line[], today: string): ParseResult {
  const lines = input.map((l) => ({ ...l, text: fixOcrMoney(l.text.replace(/\s+/g, ' ').trim()) }));
  const all = lines.map((l) => l.text).join('\n');
  const blocks = parseDayBlocks(lines.map((l) => l.text), today);
  if (blocks) return { bank: detectBank(all), mode: 'card', rows: blocks.map(({ _i, ...r }) => r), skipped: 0, cutDate: null, dueDate: null };
  const rows: (ParsedRow & { _i: number })[] = [];
  let skipped = 0;
  let curDate: string | null = null;
  let pendingDesc: string | null = null;
  let last: (ParsedRow & { _i: number }) | null = null;

  lines.forEach((line, i) => {
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const f = fold(text);
    const date = findDate(text, today);
    const monies = [...text.matchAll(MONEY)].filter((m) => parseAmount(m[2]) !== null);
    if (!monies.length) {
      // detail line under the previous row ("6 Taksit", "Taksit 2/6", "İade") or a header / merchant line
      if (last && last._i >= i - 2 && !date) {
        const inst = f.match(/(\d{1,2})\s*\/\s*(\d{1,2})/) || null;
        const count = f.match(/(\d{1,2})\s*taksit/);
        if (/taksit/.test(f) && last) {
          if (inst && +inst[1] <= +inst[2] && +inst[2] > 1) last.installment = `${+inst[1]}/${+inst[2]}`;
          else if (count && +count[1] > 1) { last.amount = Math.round((last.amount / +count[1]) * 100) / 100; last.installment = `1/${+count[1]}`; }
          return;
        }
        if (CREDIT.test(f) && last && !date) { last.kind = 'income'; last.flag = 'refund'; return; }
      }
      if (date && text.length - date.length <= 12) { curDate = date.iso; pendingDesc = null; return; } // date header
      if (!SKIP.test(f) && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(text)) pendingDesc = text; // merchant on its own line
      return;
    }
    if (SKIP.test(f)) return;
    const mm = monies[monies.length - 1];
    const amount = parseAmount(mm[2]);
    if (!amount) return;
    let desc = text.slice(0, mm.index).replace(MONEY, ' ');
    if (date) desc = desc.replace(text.slice(date.index, date.index + date.length), ' ');
    desc = cleanDescription(desc.replace(/\d{1,2}:\d{2}/g, ' '));
    if (desc.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 2) desc = pendingDesc || '';
    const rowDate = date?.iso || curDate;
    if (!rowDate) { skipped++; return; }
    const sign = mm[1];
    const credit = sign === '+' || sign === '*' || CREDIT.test(f);
    const inst = f.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*taksit|taksit\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    const row = {
      date: rowDate, description: cleanDescription(desc) || '—', amount, kind: credit ? 'income' : 'expense',
      flag: credit ? (PAYMENT.test(f) ? 'cardpay' : 'refund') : null, hint: null,
      installment: inst ? `${+(inst[1] || inst[3])}/${+(inst[2] || inst[4])}` : null, _i: i,
    } as ParsedRow & { _i: number };
    rows.push(row);
    last = row;
    pendingDesc = null;
  });

  const out: ParsedRow[] = rows.map(({ _i, ...r }) => r);
  return { bank: detectBank(all), mode: 'card', rows: out, skipped, cutDate: null, dueDate: null };
}

/** Rows from several screenshots: a row also on an earlier screenshot (they overlap) is kept once. */
export function mergeScreenshots(results: ParseResult[]): ParseResult {
  const key = (r: ParsedRow) => `${r.date}|${r.amount}|${r.kind}|${fold(r.description).replace(/[^a-z]/g, '').slice(0, 8)}`;
  const rows: ParsedRow[] = [];
  for (const res of results) {
    const before = new Map<string, number>();
    for (const r of rows) before.set(key(r), (before.get(key(r)) || 0) + 1);
    for (const r of res.rows) {
      const n = before.get(key(r)) || 0;
      if (n > 0) { before.set(key(r), n - 1); continue; }
      rows.push(r);
    }
  }
  const bank = results.find((r) => r.bank !== 'other')?.bank || 'other';
  return { bank, mode: 'card', rows, skipped: results.reduce((a, r) => a + r.skipped, 0), cutDate: null, dueDate: null };
}
