import { describe, it, expect } from 'vitest';
import { byCategory, filterTxns, monthlyTrend, totals, txnMonth } from '../../src/lib/stats';
import { payMonthFor } from '../../src/lib/paymonth';
import { DEFAULT_CATEGORIES } from '../../src/lib/defaults';
import { demoData } from '../../src/lib/demo';
import type { Txn } from '../../src/types';

const tx = (p: Partial<Txn>): Txn => ({ id: Math.random().toString(), kind: 'expense', amount: 10, date: '2026-11-02', category_id: 'groceries', person_id: 'p1', card_id: null, note: '', source: 'manual', created_at: '', ...p });

describe('stats', () => {
  const list = [tx({ amount: 100 }), tx({ amount: 50, category_id: 'dining' }), tx({ amount: 1000, kind: 'income', category_id: 'salary' }), tx({ amount: 30, date: '2026-10-30', person_id: 'p2' })];
  it('totals income/expense/net', () => {
    expect(totals(filterTxns(list, { month: '2026-11' }))).toEqual({ income: 1000, expense: 150, net: 850 });
  });
  it('filters by person', () => {
    expect(filterTxns(list, { personId: 'p2' })).toHaveLength(1);
  });
  it('groups by category with percentages summing to 1', () => {
    const s = byCategory(filterTxns(list, { month: '2026-11', kind: 'expense' }), DEFAULT_CATEGORIES, 'tr');
    expect(s[0]).toMatchObject({ id: 'groceries', value: 100, label: 'Market' });
    expect(s.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(1);
  });
  it('builds a 6 month trend', () => {
    const t = monthlyTrend(list, '2026-11', 6);
    expect(t.map((x) => x.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(t[4].expense).toBe(30);
  });
  it('avoids floating point drift', () => {
    expect(totals([tx({ amount: 0.1 }), tx({ amount: 0.2 })]).expense).toBe(0.3);
  });
  it('demo data is valid', () => {
    const d = demoData(new Date(2026, 10, 15));
    const cats = new Set(d.categories.map((c) => c.id));
    expect(d.txns.length).toBeGreaterThan(50);
    expect(d.txns.every((t) => cats.has(t.category_id) && t.amount > 0)).toBe(true);
  });
});

describe('payment month', () => {
  const card = { id: 'c', name: 'Garanti', bank: 'garanti' as const, person_id: 'p1', kind: 'card' as const, cut_day: 25, due_day: 4 };
  it('derives the month a card purchase is paid in', () => {
    expect(payMonthFor('2026-10-10', card)).toBe('2026-11'); // on 25 Oct statement, paid 4 Nov
    expect(payMonthFor('2026-10-25', card)).toBe('2026-11');
    expect(payMonthFor('2026-10-26', card)).toBe('2026-12'); // next statement
    expect(payMonthFor('2026-12-28', card)).toBe('2027-02');
    expect(payMonthFor('2026-10-10', { ...card, cut_day: 5, due_day: 15 })).toBe('2026-11');
    expect(payMonthFor('2026-10-03', { ...card, cut_day: 5, due_day: 15 })).toBe('2026-10');
  });
  it('ignores accounts and cards without days', () => {
    expect(payMonthFor('2026-10-10', { ...card, kind: 'account' })).toBeNull();
    expect(payMonthFor('2026-10-10', { ...card, cut_day: null })).toBeNull();
    expect(payMonthFor('2026-10-10', null)).toBeNull();
  });
  it('counts card spending in the payment month next to the salary', () => {
    const list = [tx({ amount: 1000, date: '2026-10-12', pay_month: '2026-11' }), tx({ amount: 50000, kind: 'income', category_id: 'salary', date: '2026-11-01' }), tx({ amount: 200, date: '2026-10-15' })];
    expect(totals(filterTxns(list, { month: '2026-11', basis: 'pay' }))).toEqual({ income: 50000, expense: 1000, net: 49000 });
    expect(totals(filterTxns(list, { month: '2026-10', basis: 'pay' })).expense).toBe(200);
    expect(totals(filterTxns(list, { month: '2026-10', basis: 'purchase' })).expense).toBe(1200);
    expect(txnMonth(list[0], 'purchase')).toBe('2026-10');
    expect(monthlyTrend(list, '2026-11', 2, 'pay').map((m) => m.expense)).toEqual([200, 1000]);
  });
});

