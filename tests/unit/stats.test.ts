import { describe, it, expect } from 'vitest';
import { byCategory, filterTxns, monthlyTrend, totals } from '../../src/lib/stats';
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
