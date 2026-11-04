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
}

export interface ParseResult {
  bank: BankId;
  mode: 'card' | 'account';
  rows: ParsedRow[];
  skipped: number;
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
const CARD_CREDIT = /(odeme(niz)?\s*(icin)?\s*tesekkur|^odeme|\bodeme\b.*(atm|internet|mobil|sube|otomatik|havale|eft)|tahsilat|iade|geri odeme|cashback|bonus iade|puan kullanim|hesaptan odeme|kart borcu odeme|borc odeme)/;
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

function money(rest: string) {
  const masked = rest.replace(INNER_DATE_RE, (m) => ' '.repeat(m.length));
  return [...masked.matchAll(MONEY_RE)]
    .map((m) => ({ raw: m[0], index: m.index!, end: m.index! + m[0].length, v: parseAmount(m[0].replace(/\s/g, '')) }))
    .filter((x) => x.v !== null) as { raw: string; index: number; end: number; v: number }[];
}

export interface RawRow { date: string; amount: number; desc: string; signed: boolean; plusSuffix: boolean; amountsFirst: boolean }

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
  }
  const descEnd = mode === 'account' ? pick.index : ms[0].index;
  const desc = rest.slice(0, descEnd).trim();
  const plusSuffix = /\+$/.test(pick.raw.trim().replace(/\s?(TL|TRY|₺)$/i, ''));
  return { date, amount: pick.v, desc, signed: true, plusSuffix, amountsFirst: false };
}

export function classify(raw: RawRow, mode: 'card' | 'account', fullDesc: string): ParsedRow | null {
  const fdesc = fold(fullDesc);
  if (SUMMARY.test(fdesc)) return null;
  let description = cleanDescription(fullDesc).replace(TRAILING_LABEL, '');
  description = cleanDescription(description);
  if (!description || description.length < 2) description = '—';

  let installment: string | null = null;
  const im = description.match(INSTALLMENT_RE);
  if (im) {
    const a = im[1] || im[3] || im[5];
    const b = im[2] || im[4];
    if (a && b && +a <= +b && +b > 1) installment = `${a}/${b}`;
    else if (a && !b) installment = `${a}.`;
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

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (!text.trim()) continue;
    let raw = splitRow(text, mode);
    // Wrapped row without y info: date+description on one line, amount on the next.
    if (!raw && LEADING_DATE.test(text) && !money(text).length && i + 1 < lines.length && !LEADING_DATE.test(lines[i + 1].text)) {
      raw = splitRow(text + ' ' + lines[i + 1].text, mode);
      if (raw) { used.add(i + 1); }
    }
    if (raw) { anchors.push({ idx: i, raw, extra: [] }); used.add(i); }
    else if (LEADING_DATE.test(text) && money(text).length) skipped++;
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
  for (const a of anchors) {
    const above = a.extra.filter((e) => e.above).map((e) => e.text);
    const below = a.extra.filter((e) => !e.above).map((e) => e.text);
    const full = [...above, a.raw.desc, ...below].join(' ');
    const r = classify(a.raw, mode, full);
    if (r) rows.push(r); // null = statement summary line, intentionally ignored
  }
  return { bank, mode, rows, skipped };
}

export function parseStatementText(text: string, bankHint?: BankId): ParseResult {
  return parseStatementLines(text.split(/\r?\n/).map((t) => ({ text: t })), bankHint);
}
