import { describe, it, expect } from 'vitest';
import { parseAmount, formatMoney } from '../../src/lib/money';
import { parseDate, shiftMonth } from '../../src/lib/dates';
import { fold, merchantKey } from '../../src/lib/text';

describe('parseAmount', () => {
  const cases: [string, number | null][] = [
    ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['1234,5', 1234.5], ['-12,00', -12], ['12,00-', -12], ['(12,00)', -12],
    ['1.234,56 TL', 1234.56], ['+45,00', 45], ['₺1.234', 1234], ['123.456,78', 123456.78], ['-123.456,78 TL', -123456.78],
    ['12.50', 12.5], ['1.234.567', 1234567], ['0,99', 0.99], ['abc', null], ['', null], ['4000,00', 4000], ['1,234', 1234],
  ];
  for (const [s, v] of cases) it(`parses "${s}"`, () => expect(parseAmount(s)).toBe(v));
});

describe('dates', () => {
  it('parses Turkish formats', () => {
    expect(parseDate('15.09.2026')).toBe('2026-09-15');
    expect(parseDate('24/09/2026')).toBe('2026-09-24');
    expect(parseDate('24/09/2026-09:29:14')).toBe('2026-09-24');
    expect(parseDate('03-08-26')).toBe('2026-08-03');
    expect(parseDate('2026-11-03')).toBe('2026-11-03');
    expect(parseDate('12 Mart 2026')).toBe('2026-03-12');
    expect(parseDate('5 Ağustos 2026')).toBe('2026-08-05');
    expect(parseDate('7 Eyl 2026')).toBe('2026-09-07');
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('text', () => {
  it('folds Turkish characters', () => {
    expect(fold('ŞOK MARKET İSTANBUL')).toBe('sok market istanbul');
    expect(fold('IĞDIR ÇİÇEK')).toBe('igdir cicek');
  });
  it('builds merchant keys ignoring numbers and city', () => {
    expect(merchantKey('MIGROS 1234 ISTANBUL TR')).toBe('migros');
    expect(merchantKey('Migros Ticaret A.Ş.')).toBe('migros ticaret');
  });
});

describe('formatMoney', () => {
  it('uses compact notation for millions in tiles', () => {
    expect(formatMoney(9999999999.99, 'TRY', 'tr', true).length).toBeLessThan(10);
    expect(formatMoney(250000, 'TRY', 'tr', true)).toMatch(/250\.000/);
  });
  it('formats TRY in Turkish', () => {
    expect(formatMoney(1234.5, 'TRY', 'tr')).toMatch(/1\.234,50/);
  });
});
