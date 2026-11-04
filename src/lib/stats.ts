import type { Category, Kind, Txn } from '../types';

export interface Slice { id: string; label: string; value: number; color: string; icon: string; pct: number }

export type MonthBasis = 'pay' | 'purchase';
export interface Filter { month?: string; personId?: string | null; cardId?: string | null; kind?: Kind; basis?: MonthBasis }

/** Budget month of a transaction: card purchases count in the month the bill is paid, unless basis is 'purchase'. */
export function txnMonth(t: Txn, basis: MonthBasis = 'pay'): string {
  return basis === 'pay' && t.pay_month ? t.pay_month : t.date.slice(0, 7);
}

export function filterTxns(txns: Txn[], f: Filter): Txn[] {
  return txns.filter((t) =>
    (!f.month || txnMonth(t, f.basis) === f.month) &&
    (!f.personId || t.person_id === f.personId) &&
    (!f.cardId || t.card_id === f.cardId) &&
    (!f.kind || t.kind === f.kind));
}

export function totals(txns: Txn[]) {
  let income = 0, expense = 0;
  for (const t of txns) (t.kind === 'income' ? (income += t.amount) : (expense += t.amount));
  income = Math.round(income * 100) / 100;
  expense = Math.round(expense * 100) / 100;
  return { income, expense, net: Math.round((income - expense) * 100) / 100 };
}

export function byCategory(txns: Txn[], cats: Category[], lang: 'en' | 'tr'): Slice[] {
  const map = new Map<string, number>();
  for (const t of txns) map.set(t.category_id, (map.get(t.category_id) || 0) + t.amount);
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const slices: Slice[] = [];
  for (const [id, value] of map) {
    const c = cats.find((x) => x.id === id);
    slices.push({
      id,
      label: c ? (lang === 'tr' ? c.name_tr : c.name_en) : '?',
      value: Math.round(value * 100) / 100,
      color: c?.color || '#999',
      icon: c?.icon || '❔',
      pct: total ? value / total : 0,
    });
  }
  return slices.sort((a, b) => b.value - a.value);
}

/** Totals per month for the `count` months ending at `endMonth`. */
export function monthlyTrend(txns: Txn[], endMonth: string, count: number, basis: MonthBasis = 'pay') {
  const keys: string[] = [];
  const [y, m] = endMonth.split('-').map(Number);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys.map((k) => ({ month: k, ...totals(txns.filter((t) => txnMonth(t, basis) === k)) }));
}
