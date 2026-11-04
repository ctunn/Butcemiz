import type { Lang } from '../types';

/**
 * Parse money strings in Turkish or English formats.
 * "1.234,56" "1,234.56" "1234,5" "-12,00" "12,00-" "(12,00)" "1.234,56 TL" "+45,00" "₺1.234"
 */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/(TL|TRY|₺|USD|EUR|\$|€)/gi, '').replace(/\s/g, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.endsWith('+')) s = s.slice(0, -1);
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // whichever comes last is the decimal separator
    if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.');
    else normalized = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const commas = (s.match(/,/g) || []).length;
    if (commas === 1 && decimals !== 3) normalized = s.replace(',', '.');
    else normalized = s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) || []).length;
    const decimals = s.length - lastDot - 1;
    // Turkish thousands: "1.234" or "1.234.567"; otherwise decimal
    if (decimals === 3 && (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s))) normalized = s.replace(/\./g, '');
    else if (dots > 1) return null;
    else normalized = s;
  } else normalized = s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(n: number, currency: string, lang: Lang, compact = false): string {
  try {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...(compact && Math.abs(n) >= 1e6
        ? { notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 }
        : { maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: compact ? 0 : 2 }),
    }).format(n).replace(/^-/, '\u2212'); // typographic minus
  } catch {
    return n.toFixed(2) + ' ' + currency;
  }
}
