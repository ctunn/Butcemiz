import type { Data, Txn } from '../types';
import { emptyData } from './defaults';

/** Deterministic demo data for the last 3 months (used by "Load demo data" and the tests). */
export function demoData(today = new Date()): Data {
  const d = emptyData();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const txns: Txn[] = [];
  const add = (monthsAgo: number, day: number, kind: 'expense' | 'income', amount: number, cat: string, person: string, card: string | null, note: string) => {
    const dt = new Date(today.getFullYear(), today.getMonth() - monthsAgo, Math.min(day, 28));
    if (dt > today) return;
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    txns.push({ id: `demo-${txns.length}`, kind, amount: Math.round(amount * 100) / 100, date: iso, category_id: cat, person_id: person, card_id: card, note, source: 'manual', import_id: null, created_at: dt.toISOString() });
  };
  for (let m = 0; m < 3; m++) {
    add(m, 1, 'income', 85000, 'salary', 'p1', null, 'Maaş');
    add(m, 1, 'income', 72000, 'salary', 'p2', null, 'Maaş');
    add(m, 2, 'expense', 32000, 'housing', 'p1', null, 'Kira');
    add(m, 5, 'expense', 1850 + rnd() * 400, 'bills', 'p1', 'c-garanti-p1', 'ENERJISA');
    add(m, 6, 'expense', 650, 'bills', 'p2', 'c-yk-p2', 'TURKCELL');
    add(m, 9, 'expense', 229.99, 'subscriptions', 'p1', 'c-qnb-p1', 'NETFLIX');
    add(m, 9, 'expense', 99.99, 'subscriptions', 'p2', 'c-yk-p2', 'SPOTIFY');
    for (let i = 0; i < 8; i++) add(m, 2 + i * 3, 'expense', 400 + rnd() * 1800, 'groceries', i % 2 ? 'p2' : 'p1', i % 2 ? 'c-isbank-p2' : 'c-isbank-p1', i % 3 ? 'MIGROS' : 'A101');
    for (let i = 0; i < 5; i++) add(m, 4 + i * 5, 'expense', 250 + rnd() * 900, 'dining', i % 2 ? 'p2' : 'p1', 'c-garanti-p1', i % 2 ? 'Starbucks' : 'Yemeksepeti');
    for (let i = 0; i < 3; i++) add(m, 3 + i * 9, 'expense', 1500 + rnd() * 1200, 'transport', 'p1', 'c-qnb-p1', 'SHELL');
    add(m, 14, 'expense', 1200 + rnd() * 3000, 'shopping', 'p2', 'c-yk-p2', 'TRENDYOL');
    add(m, 18, 'expense', 450 + rnd() * 600, 'health', 'p2', null, 'Eczane');
    add(m, 21, 'expense', 600 + rnd() * 800, 'entertainment', 'p1', 'c-garanti-p1', 'Sinema');
    add(m, 23, 'expense', 380, 'personal', 'p1', null, 'Berber');
  }
  d.txns = txns;
  return d;
}
