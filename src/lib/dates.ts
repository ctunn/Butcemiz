const TR_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
import { fold } from './text';

function pad(n: number) { return String(n).padStart(2, '0'); }

export function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Regex source matching dates at the start of a statement line. */
export const DATE_RE_SRC = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})|(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3,9})\.?\s+(\d{4})`;

/** Parse a date in dd.mm.yyyy, dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, or "12 Mart 2025" form. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return isoDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3,9})\.?\s+(\d{4})/);
  if (m) {
    const mon = fold(m[2]);
    let idx = TR_MONTHS.findIndex((x) => mon.startsWith(x.slice(0, 3)) && x.startsWith(mon.slice(0, 3)));
    if (idx < 0) idx = EN_MONTHS.findIndex((x) => mon.startsWith(x));
    if (idx >= 0) return isoDate(+m[3], idx + 1, +m[1]);
  }
  return null;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(iso: string): string { return iso.slice(0, 7); }

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(key: string, lang: 'en' | 'tr'): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'long', year: 'numeric' });
}

export function dayLabel(iso: string, lang: 'en' | 'tr'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}
