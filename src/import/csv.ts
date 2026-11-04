import { parseAmount } from '../lib/money';
import { parseDate } from '../lib/dates';
import { fold } from '../lib/text';
import { classify, type ParsedRow, type RawRow } from './parse';

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [';', ',', '\t', '|'].map((d) => ({ d, n: sample.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].d;
}

/** RFC-4180-ish CSV parser with quotes. */
export function parseCSV(text: string, delimiter?: string): string[][] {
  text = text.replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

const H = {
  date: /^(islem\s*)?tarih|^date|transaction date|^tarih/,
  desc: /aciklama|islem\s*(detay|adi|aciklamasi)?$|description|merchant|isyeri|detail|^islem$|narrative/,
  amount: /^tutar|amount|^islem tutari|tutar\s*\(?(tl|try)|^miktar/,
  debit: /^borc|debit|harcama/,
  credit: /^alacak|credit(?! card)/,
};

export interface CsvColumns { date: number; desc: number; amount: number; debit: number; credit: number; headerRow: number }

export function detectColumns(rows: string[][]): CsvColumns | null {
  // 1) header row with recognisable names
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const h = rows[r].map((c) => fold(c));
    const find = (re: RegExp) => h.findIndex((x) => re.test(x));
    const date = find(H.date);
    if (date < 0) continue;
    const desc = find(H.desc);
    const amount = find(H.amount);
    const debit = find(H.debit);
    const credit = find(H.credit);
    if (desc >= 0 && (amount >= 0 || debit >= 0)) return { date, desc, amount, debit, credit, headerRow: r };
  }
  // 2) infer from data: first column with dates, column with most amounts, longest text column
  const data = rows.filter((r) => r.some((c) => parseDate(c)));
  if (!data.length) return null;
  const width = Math.max(...data.map((r) => r.length));
  const score = (fn: (s: string) => boolean) => Array.from({ length: width }, (_, i) => data.filter((r) => r[i] !== undefined && fn(r[i])).length);
  const dateScore = score((s) => !!parseDate(s));
  const date = dateScore.indexOf(Math.max(...dateScore));
  const amtScore = score((s) => !parseDate(s) && /\d[.,]\d{2}\D*$/.test(s) && parseAmount(s) !== null);
  amtScore[date] = -1;
  const amount = amtScore.lastIndexOf(Math.max(...amtScore));
  const lenScore = Array.from({ length: width }, (_, i) => (i === date || i === amount ? -1 : data.reduce((a, r) => a + ((r[i] || '').replace(/[\d.,\s-]/g, '').length), 0)));
  const desc = lenScore.indexOf(Math.max(...lenScore));
  if (amount < 0 || desc < 0) return null;
  return { date, desc, amount, debit: -1, credit: -1, headerRow: -1 };
}

export function parseCsvStatement(text: string): { rows: ParsedRow[]; skipped: number; mode: 'card' | 'account' } {
  const table = parseCSV(text);
  const cols = detectColumns(table);
  if (!cols) return { rows: [], skipped: table.length, mode: 'card' };
  const header = cols.headerRow >= 0 ? table[cols.headerRow].map(fold).join(' ') : '';
  const raws: RawRow[] = [];
  let skipped = 0;
  for (let i = cols.headerRow + 1; i < table.length; i++) {
    const r = table[i];
    const date = parseDate(r[cols.date] || '');
    if (!date) { skipped++; continue; }
    let amount: number | null = null;
    if (cols.amount >= 0) amount = parseAmount(r[cols.amount]);
    if ((amount === null || amount === 0) && cols.debit >= 0) {
      const deb = parseAmount(r[cols.debit]);
      const cre = cols.credit >= 0 ? parseAmount(r[cols.credit]) : null;
      if (deb) amount = -Math.abs(deb);
      else if (cre) amount = Math.abs(cre);
    }
    const desc = (r[cols.desc] || '').replace(/\s+/g, ' ').trim();
    if (amount === null || amount === 0 || !desc) { skipped++; continue; }
    raws.push({ date, amount, desc, signed: true, plusSuffix: false, amountsFirst: false });
  }
  // Account exports (balance column, debit/credit columns, or mostly negative numbers): minus = spending.
  const neg = raws.filter((x) => x.amount < 0).length;
  const mode: 'card' | 'account' = /bakiye|balance/.test(header) || cols.debit >= 0 || neg > raws.length / 2 ? 'account' : 'card';
  const rows: ParsedRow[] = [];
  for (const raw of raws) {
    const c = classify(raw, mode, raw.desc);
    if (c) rows.push(c); else skipped++;
  }
  return { rows, skipped, mode };
}
