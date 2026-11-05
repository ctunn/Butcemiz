import type { Txn } from '../types';

/**
 * Rows that are the same transaction saved twice (e.g. a statement imported twice, or typed by hand
 * and later imported): same account, date, amount, type and budget month, but from different saves.
 * Returns the extra copies to remove; the copy that knows its installment plan, else the imported one, else the oldest is kept.
 */
export function findDuplicates(txns: Txn[]): Txn[] {
  const groups = new Map<string, Txn[]>();
  for (const x of txns) {
    if (x.projected) continue;
    const k = [x.card_id || '-', x.date, x.amount.toFixed(2), x.kind, x.pay_month || ''].join('|');
    const l = groups.get(k);
    if (l) l.push(x); else groups.set(k, [x]);
  }
  const extra: Txn[] = [];
  for (const l of groups.values()) {
    if (l.length < 2) continue;
    // copies from the same import are separate real purchases (e.g. two coffees): keep one per save
    const bySave = new Map<string, Txn[]>();
    for (const x of l) { const s = x.import_id || 'manual:' + x.id; const b = bySave.get(s); if (b) b.push(x); else bySave.set(s, [x]); }
    if (bySave.size < 2) continue;
    const saves = [...bySave.values()].sort((a, b) =>
      Number(!!b.some((x) => x.plan_key)) - Number(!!a.some((x) => x.plan_key)) || Number(!!b[0].import_id) - Number(!!a[0].import_id) || (a[0].created_at || '').localeCompare(b[0].created_at || ''));
    const keep = saves[0].length;
    // anything beyond what the kept save has is an extra copy
    const rest = saves.slice(1).flat();
    const surplus = Math.max(0, l.length - keep);
    extra.push(...rest.slice(0, Math.min(surplus, rest.length)));
  }
  // a planned installment that is already on a statement (same plan and number, or same plan and month)
  const real = txns.filter((x) => !x.projected && x.plan_key);
  for (const x of txns) {
    if (!x.projected || !x.plan_key) continue;
    if (real.some((r) => r.plan_key === x.plan_key && (r.inst_no === x.inst_no || (r.pay_month || r.date.slice(0, 7)) === (x.pay_month || x.date.slice(0, 7))))) extra.push(x);
  }
  return extra;
}
