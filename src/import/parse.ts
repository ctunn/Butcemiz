import type { BankId, Kind } from '../types';
import { parseAmount } from '../lib/money';
import { parseDate } from '../lib/dates';
import { fold } from '../lib/text';

/** Why a row is unticked by default: it moves money around rather than being real spending/income. */
export type RowFlag = 'cardpay' | 'transfer' | 'investment' | 'cash' | 'refund' | null;

export interface ParsedRow {
  date: string; // ISO
  description: string;
  amount: number; // always positive
  kind: Kind;
  flag: RowFlag;
  hint?: 'fees' | 'loan' | 'salary' | null; // category hint from the bank's own wording
  installment?: string | null; // e.g. "2/6"
  bankCat?: string | null; // our category for the bank app's own category label (screenshots)
}

export interface ParseResult {
  bank: BankId;
  mode: 'card' | 'account';
  rows: ParsedRow[];
  skipped: number;
  cutDate?: string | null; // statement cut-off date (card statements)
  dueDate?: string | null; // payment due date (card statements)
  raw?: string; // text read from screenshots, shown when nothing could be recognised
}

export interface Line { text: string; y?: number; page?: number }

const BANK_SIGNS: [BankId, RegExp][] = [
  ['garanti', /garanti|bonus\s*card|bonus\s*kart|miles\s*&?\s*smiles|shop\s*&\s*fly|money\s*bonus/],
  ['yapikredi', /yapi\s*kredi|world\s*card|worldcard|worldpuan|adios|play\s*card|crystal/],
  ['qnb', /qnb|finansbank|cardfinans|card\s*finans|parafpara|enpara/],
  ['isbank', /is\s*bankasi|isbank|iscep|maximum\s*kart|maximum\s*card|maximiles|maxipuan|bankamatik/],
];

export function detectBank(text: string): BankId {
  const f = fold(text.slice(0, 20000));
  for (const [id, re] of BANK_SIGNS) if (re.test(f)) return id;
  // Garanti's app shows the card name ("BONUS PLATINUM") and Bonus points on every row
  if (/\bbonus\b/.test(f)) return 'garanti';
  return 'other';
}

/** Credit-card statement ("ekstre") vs bank-account statement ("hesap hareketleri"). */
export function detectMode(text: string): 'card' | 'account' {
  const f = fold(text.slice(0, 30000));
  if (/hesap kesim|son odeme tarihi|asgari odeme|donem borcu|ekstre borcu/.test(f)) return 'card';
  if (/hesap hareket|hesap ozeti|vadesiz|bakiye/.test(f)) return 'account';
  return 'card';
}

// Statement summary lines, not purchases.
const SUMMARY = /(onceki donem|donem borcu|asgari|son odeme|hesap kesim|toplam borc|kart limiti|kullanilabilir|ekstre borcu|odenmesi gereken|faiz orani|toplam harcama|donem ici|bir sonraki|kalan borc|devreden|tarihleri arasindaki|kayit bulunmustur|itibariyla)/;
// Card statement credits: payments to the card, refunds, cashback.
const CARD_CREDIT = /(kampanya|odeme(niz)?\s*(icin)?\s*tesekkur|^odeme|\bodeme\b.*(atm|internet|mobil|sube|otomatik|havale|eft)|tahsilat|iade|geri odeme|cashback|bonus iade|puan kullanim|hesaptan odeme|kart borcu odeme|borc odeme)/;
const F_CARDPAY = /(k\.?\s*karti odeme|kart odemesi|kre\.?\s*kart borc|kredi karti (borc|odeme)|kart borcu|kk odeme)/;
const F_INVEST = /(fon (alis|satis)|yatirim|stopaj|altin (alis|satis)|doviz (alis|satis)|\.fx\.|\bfx\b|repo|hisse|borsa|vadeli hesa)/;
const F_FEE = /(ucret|komisyon|masraf|kesinti ve ekleri|bsmv|hesap isletim)/;
const F_LOAN = /(kredi no|anapara|kredi taksit|kredi odeme|faiz tahsil)/;
const F_CASH = /(para cekme|bankamatik|\batm\b)/;
const F_TRANSFER = /(para transferi|\bfast\b|havale|\beft\b|virman|tarafindan aktarilan|\bhvl\b|aktarma|hesabina aktar)/;
const F_SALARY = /(maas|promosyon|ucret odemesi|bordro)/;

// Money: 1.234,56 / 1234,56 / -12,00 / 12,00+ / 1,234.56 — must have 2 decimals so dates, installments and card numbers don't match.
const MONEY_RE = /(?<![\d.,])[-+]?\(?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}(?![\d])\)?[-+]?(?:\s?(?:TL|TRY|₺))?/g;
const INNER_DATE_RE = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}:\d{2}(:\d{2})?/g;
const FOREIGN_RE = /\b(USD|EUR|GBP|\$|€|£)\s?\d|\d\s?(USD|EUR|GBP|\$|€|£)\b/;
const LEADING_DATE = /^\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]{3,9}\.?\s+\d{4})(?:[-\s]\d{1,2}:\d{2}(?::\d{2})?)?\s+/;
const INSTALLMENT_RE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:\.?\s*taksit|taks\.?|ts)?|taksit\s*(\d{1,2})\s*\/\s*(\d{1,2})|(\d{1,2})\.\s*taksit/i;
// Column labels some banks print at the end of the description (Garanti "Etiket").
const TRAILING_LABEL = /\s+(Para Transferi|Faiz \/ Komisyon|Yatırım|Maaş|Kart Ödemesi|Diğer|Alışveriş|Fatura|Kredi|Döviz|Nakit)$/i;
// İş Bankası transaction codes printed before the description ("FA FAST", "QP Yatırım", "0S Havale").
const LEADING_CODE = /^[A-Z0-9]{2}\s+/;

export function cleanDescription(s: string): string {
  return s
    .replace(/TR\d{2}[\d\s]{18,32}/g, ' ') // IBAN
    .replace(/\bH\d{10,}\b/g, ' ') // bank reference numbers
    .replace(/\*\d{6,}/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s|:\-–]+$/, '')
    .replace(/^[\s|:\-–]+/, '')
    .trim();
}

// Garanti-style installment column: "2.190,30x6=13.141,80 1.Taksit" (installment x count = total, nth installment).
const POINTS_RE = /(?:MAX[İIiı]M[İIiı]L|MAX[İIiı]PUAN|WORLDPUAN|BONUS|PUAN)\s*:\s*\d+(?:[.,]\d+)?/gi;
const REMAINING_RE = /\d{1,3}(?:\.\d{3})*,\d{2}\s*\/\s*\d{1,2}(?!\d)/g;
/** Yapı Kredi note under an installment row: "5.864,97 TL'lik işlemin 1 / 8 taksidi". */
const INST_NOTE_RE = /tl['’]?\s*l[iı]k\s+islemin\s+(\d{1,2})\s*\/\s*(\d{1,2})\s+taksid/;
const INST_X_RE = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*[xX×]\s*(\d{1,2})\s*=\s*(\d{1,3}(?:\.\d{3})*,\d{2})(\s*(\d{1,2})\s*\.?\s*taksit)?/i;
// Card statement interest/tax lines printed without a date.
const FEE_LINE = /^(donem faizi|gec odeme faizi|gecikme faizi|akdi faiz|kkdf|bsmv|yillik kart (ucreti|aidati)|kart aidati|ekstre ucreti|nakit avans faizi)/;

/** Date printed after a label such as "Son Ödeme Tarihi: 04 Kasım 2026". */
export function findLabeledDate(text: string, label: string): string | null {
  const f = fold(text);
  const re = new RegExp(label + '\\W{0,6}(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{1,2}\\s+[a-z]{3,9}\\s+\\d{4})');
  const m = f.match(re);
  return m ? parseDate(m[1]) : null;
}

function money(rest: string) {
  const masked = rest.replace(INNER_DATE_RE, (m) => ' '.repeat(m.length));
  return [...masked.matchAll(MONEY_RE)]
    .map((m) => ({ raw: m[0], index: m.index!, end: m.index! + m[0].length, v: parseAmount(m[0].replace(/\s/g, '')) }))
    .filter((x) => x.v !== null) as { raw: string; index: number; end: number; v: number }[];
}

export interface RawRow { date: string; amount: number; desc: string; signed: boolean; plusSuffix: boolean; amountsFirst: boolean; installment?: string | null }

/** Find an installment marker such as "3/6", "Taksit 3/6", "3/6 TAKSIT", "6 taksitin 3.sü" or "3. taksit". */
export function findInstallment(text: string): { n: number; of: number | null } | null {
  const masked = text.replace(INNER_DATE_RE, (m) => ' '.repeat(m.length));
  let m = masked.match(/(\d{1,2})\s*taksit(?:in|ten)\s*(\d{1,2})/i);
  if (m && +m[2] >= 1 && +m[2] <= +m[1] && +m[1] > 1) return { n: +m[2], of: +m[1] };
  m = masked.match(INSTALLMENT_RE);
  if (!m) return null;
  const a = m[1] || m[3] || m[5];
  const b = m[2] || m[4];
  if (a && b && +a >= 1 && +a <= +b && +b > 1 && +b <= 48) return { n: +a, of: +b };
  if (a && !b) return { n: +a, of: null };
  return null;
}

/** Split one text row into date / signed amount / description. Returns null if it is not a transaction row. */
export function splitRow(line: string, mode: 'card' | 'account'): RawRow | null {
  const dm = line.match(LEADING_DATE);
  if (!dm) return null;
  const date = parseDate(dm[1]);
  if (!date) return null;
  let rest = line.slice(dm[0].length);
  // A second (posting) date right after the transaction date.
  const second = rest.match(LEADING_DATE);
  if (second && parseDate(second[1])) rest = rest.slice(second[0].length);
  // Remove the "installment x count = total" column so the total is never taken as this month's amount.
  let instX: string | null = null;
  if (mode === 'card') {
    const xm = rest.match(INST_X_RE);
    if (xm) {
      instX = xm[5] ? `${xm[5]}/${xm[2]}` : `?/${xm[2]}`;
      rest = rest.slice(0, xm.index!) + ' '.repeat(xm[0].length) + rest.slice(xm.index! + xm[0].length);
    }
    // Reward points printed inside the row ("KAZANILAN MAXİMİL:36,00", "MAXİPUAN:0,02") are not money.
    rest = rest.replace(POINTS_RE, (m) => ' '.repeat(m.length));
    // Yapı Kredi "Kalan Tutar / Taksit" column ("5.131,84 / 7"): what is still owed later, not this month's amount.
    rest = rest.replace(REMAINING_RE, (m) => ' '.repeat(m.length));
  }
  const ms = money(rest);
  if (!ms.length) return null;

  // Layout A (İş Bankası account): "<channel> <amount> <balance> <extra> <code> <type> <description>"
  const before = rest.slice(0, ms[0].index).trim();
  const amountsFirst = mode === 'account' && ms.length >= 2 && before.split(/\s+/).filter(Boolean).length <= 1 && /^\s*$/.test(rest.slice(ms[0].end, ms[1].index));
  if (amountsFirst) {
    let k = 0;
    while (k + 1 < ms.length && /^\s*$/.test(rest.slice(ms[k].end, ms[k + 1].index))) k++;
    const desc = rest.slice(ms[k].end).trim().replace(LEADING_CODE, '');
    return { date, amount: ms[0].v, desc, signed: /^[-+(]/.test(ms[0].raw) || ms[0].v < 0, plusSuffix: false, amountsFirst: true };
  }

  // Layout B: "<description> <amount> [<balance>|<points>]"
  let pick = ms[0];
  if (mode === 'account') pick = ms.length >= 2 ? ms[ms.length - 2] : ms[0];
  else {
    pick = ms.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
    if (ms.length > 1 && FOREIGN_RE.test(rest)) pick = ms[ms.length - 1];
    // Installment purchase: banks print the full purchase amount and this month's installment
    // (e.g. "MEDIAMARKT 3/6 12.000,00 2.000,00"). Only the installment belongs to this month.
    const inst = findInstallment(rest);
    if (inst && inst.of && ms.length >= 2) {
      const total = Math.abs(pick.v);
      const target = total / inst.of;
      const others = ms.filter((x) => x !== pick);
      const best = others.reduce((a, b) => (Math.abs(Math.abs(b.v) - target) < Math.abs(Math.abs(a.v) - target) ? b : a));
      // accept when it is within 2% of total/n (banks round the last installment)
      if (Math.abs(Math.abs(best.v) - target) <= Math.max(1, target * 0.02)) pick = best;
    }
  }
  const descEnd = mode === 'account' ? pick.index : ms[0].index;
  const desc = rest.slice(0, descEnd).trim().replace(/\s+KAZANILAN\s*$/i, '');
  const plusSuffix = /\+$/.test(pick.raw.trim().replace(/\s?(TL|TRY|₺)$/i, ''));
  const inst = instX ? null : findInstallment(rest);
  const installment = instX ?? (inst ? (inst.of ? `${inst.n}/${inst.of}` : `${inst.n}.`) : null);
  return { date, amount: pick.v, desc, signed: true, plusSuffix, amountsFirst: false, installment };
}

export function classify(raw: RawRow, mode: 'card' | 'account', fullDesc: string): ParsedRow | null {
  const fdesc = fold(fullDesc);
  if (SUMMARY.test(fdesc)) return null;
  let description = cleanDescription(fullDesc).replace(TRAILING_LABEL, '');
  description = cleanDescription(description);
  if (!description || description.length < 2) description = '—';

  let installment: string | null = raw.installment ?? null;
  if (!installment) {
    const inst = findInstallment(description);
    if (inst) installment = inst.of ? `${inst.n}/${inst.of}` : `${inst.n}.`;
  }

  const amount = Math.abs(raw.amount);
  if (!amount) return null;

  if (mode === 'card') {
    const credit = raw.amount < 0 || raw.plusSuffix || CARD_CREDIT.test(fdesc);
    return { date: raw.date, description, amount, kind: credit ? 'income' : 'expense', flag: credit ? 'refund' : null, installment, hint: null };
  }

  // Bank account: minus = money out, plus = money in.
  const kind: Kind = raw.amount < 0 ? 'expense' : 'income';
  let flag: RowFlag = null;
  let hint: ParsedRow['hint'] = null;
  if (F_CARDPAY.test(fdesc)) flag = 'cardpay';
  else if (F_FEE.test(fdesc) && kind === 'expense' && !F_INVEST.test(fdesc)) hint = 'fees';
  else if (F_LOAN.test(fdesc) && kind === 'expense') hint = 'loan';
  else if (F_INVEST.test(fdesc)) flag = 'investment';
  else if (F_CASH.test(fdesc) && kind === 'expense') flag = 'cash';
  else if (F_SALARY.test(fdesc) && kind === 'income') hint = 'salary';
  else if (F_TRANSFER.test(fdesc)) flag = 'transfer';
  return { date: raw.date, description, amount, kind, flag, hint, installment };
}

/**
 * Parse statement text lines. When y positions are known (PDF), description text that a bank
 * wraps onto lines above/below the row (İş Bankası) is attached to the nearest dated row.
 */
export function parseStatementLines(lines: Line[], bankHint?: BankId): ParseResult {
  const all = lines.map((l) => l.text).join('\n');
  const bank = bankHint && bankHint !== 'other' ? bankHint : detectBank(all);
  const mode = detectMode(all);
  const anchors: { idx: number; raw: RawRow; extra: { text: string; dist: number; above: boolean }[] }[] = [];
  let skipped = 0;
  const used = new Set<number>();

  // Some card statements (İş Bankası app export) print charges as "1,240.36-" and credits as "360.00+".
  // When most dated rows end in "-", a trailing minus means a charge, not a refund.
  let trailMinus = 0, trailPlus = 0;
  if (mode === 'card') for (const l of lines) {
    if (!LEADING_DATE.test(l.text)) continue;
    if (/\d[.,]\d{2}\s*-\s*$/.test(l.text)) trailMinus++;
    else if (/\d[.,]\d{2}\s*\+\s*$/.test(l.text)) trailPlus++;
  }
  const minusIsCharge = trailMinus >= 3 && trailMinus > trailPlus * 2;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (!text.trim()) continue;
    let raw = splitRow(text, mode);
    if (raw && minusIsCharge && raw.amount < 0) raw = { ...raw, amount: -raw.amount };
    // Wrapped row without y info: date+description on one line, amount on the next.
    if (!raw && LEADING_DATE.test(text) && !money(text).length && i + 1 < lines.length && !LEADING_DATE.test(lines[i + 1].text)) {
      raw = splitRow(text + ' ' + lines[i + 1].text, mode);
      if (raw) { used.add(i + 1); }
    }
    if (raw) {
      anchors.push({ idx: i, raw, extra: [] }); used.add(i);
      const next = lines[i + 1];
      const nm = mode === 'card' && next && next.page === lines[i].page ? fold(next.text).match(INST_NOTE_RE) : null;
      if (nm && +nm[1] >= 1 && +nm[1] <= +nm[2] && +nm[2] > 1) {
        if (!raw.installment) raw.installment = `${+nm[1]}/${+nm[2]}`;
        used.add(i + 1);
        i++;
      }
    }
    else if (LEADING_DATE.test(text) && money(text.replace(POINTS_RE, ' ')).length) skipped++;
  }

  // Attach continuation lines (only for amounts-first layouts, where the description cell wraps).
  const hasY = lines.some((l) => l.y !== undefined);
  if (hasY && anchors.some((a) => a.raw.amountsFirst)) {
    const gaps: number[] = [];
    for (let k = 1; k < anchors.length; k++) {
      const a = lines[anchors[k - 1].idx], b = lines[anchors[k].idx];
      if (a.page === b.page && a.y !== undefined && b.y !== undefined) gaps.push(Math.abs(a.y - b.y));
    }
    const lineH = Math.max(6, Math.min(14, ...lines.slice(1).map((l, i) => (l.page === lines[i].page && l.y !== undefined && lines[i].y !== undefined ? Math.abs(lines[i].y! - l.y) : 99)).filter((d) => d > 2)));
    const maxDist = lineH * 2.6;
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i) || !lines[i].text.trim() || lines[i].y === undefined) continue;
      if (/^\(\*\)|sayfa \d|^\d+\s*\/\s*\d+$/i.test(lines[i].text.trim())) continue;
      let best: (typeof anchors)[number] | null = null, bestD = Infinity;
      for (const a of anchors) {
        const al = lines[a.idx];
        if (al.page !== lines[i].page) continue;
        const d = Math.abs(al.y! - lines[i].y!);
        if (d < bestD) { bestD = d; best = a; }
      }
      if (best && bestD <= maxDist) best.extra.push({ text: lines[i].text, dist: bestD, above: lines[i].y! > lines[best.idx].y! });
    }
    void gaps;
  }

  const rows: ParsedRow[] = [];
  const cutDate = mode === 'card' ? findLabeledDate(all, 'hesap kesim tarihi') : null;
  const dueDate = mode === 'card' ? findLabeledDate(all, 'son odeme tarihi') : null;
  // Interest and tax lines on card statements (no date): book them on the statement cut-off date.
  if (mode === 'card') {
    if (cutDate) {
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) continue;
        const f = fold(lines[i].text.trim());
        if (!FEE_LINE.test(f)) continue;
        const ms = money(lines[i].text);
        if (ms.length !== 1 || ms[0].v <= 0) continue;
        rows.push({ date: cutDate, description: cleanDescription(lines[i].text.slice(0, ms[0].index)), amount: ms[0].v, kind: 'expense', flag: null, hint: 'fees', installment: null });
      }
    }
  }
  for (const a of anchors) {
    const above = a.extra.filter((e) => e.above).map((e) => e.text);
    const below = a.extra.filter((e) => !e.above).map((e) => e.text);
    const full = [...above, a.raw.desc, ...below].join(' ');
    const r = classify(a.raw, mode, full);
    if (r) rows.push(r); // null = statement summary line, intentionally ignored
  }
  return { bank, mode, rows, skipped, cutDate, dueDate };
}

export function parseStatementText(text: string, bankHint?: BankId): ParseResult {
  return parseStatementLines(text.split(/\r?\n/).map((t) => ({ text: t })), bankHint);
}
