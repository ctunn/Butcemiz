import type { Kind, Txn } from '../types';
import { merchantKey } from './text';
import { shiftMonth } from './dates';

export function parseInst(s: string | null | undefined): { n: number; of: number } | null {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const n = +m[1], of = +m[2];
  return n >= 1 && of >= 2 && n <= of ? { n, of } : null;
}

/** Same purchase on every statement: card + purchase date + installment count + rounded amount + merchant. */
export function planKey(cardId: string | null, date: string, of: number, amount: number, desc: string): string {
  return [cardId || '-', date, of, Math.round(amount), merchantKey(desc)].join('|');
}

export interface ImportRow { date: string; description: string; amount: number; kind: Kind; category: string; installment?: string | null }

export interface ImportCtx {
  cardId: string | null;
  personId: string | null;
  payMonth: string | null; // payment month of this statement
  importId: string;
  now: string;
  uid: () => string;
}

/** True when this installment of this purchase is already on file (not just planned). */
export function isInstallmentDuplicate(r: ImportRow, cardId: string | null, existing: Txn[], payMonth?: string | null): boolean {
  const inst = parseInst(r.installment);
  if (!inst) return false;
  const key = planKey(cardId, r.date, inst.of, r.amount, r.description);
  if (existing.some((x) => x.plan_key === key && x.inst_no === inst.n && !x.projected)) return true;
  // Same statement again where the bank prints a posting date (it changes, the payment month does not).
  if (!payMonth) return false;
  const mk = merchantKey(r.description);
  return existing.some((x) => !x.projected && x.inst_no === inst.n && x.pay_month === payMonth && !!x.plan_key
    && (x.card_id || null) === (cardId || null) && +x.plan_key.split('|')[2] === inst.of
    && x.plan_key.split('|').slice(4).join('|') === mk && Math.abs(x.amount - r.amount) <= 1);
}

/**
 * Turn selected statement rows into transactions. Installment rows (n/N) also plan the remaining
 * installments in the following months; a planned row that later appears on a statement is
 * replaced in place, so nothing is counted twice.
 */
export function buildImport(rows: ImportRow[], existing: Txn[], ctx: ImportCtx): Txn[] {
  const out: Txn[] = [];
  const has = (key: string, n: number) =>
    out.find((x) => x.plan_key === key && x.inst_no === n) || existing.find((x) => x.plan_key === key && x.inst_no === n);
  for (const r of rows) {
    const inst = r.kind === 'expense' ? parseInst(r.installment) : null;
    const note = r.description + (r.installment ? ` (${r.installment})` : '');
    const base: Txn = {
      id: ctx.uid(), kind: r.kind, amount: r.amount, date: r.date, category_id: r.category,
      person_id: ctx.personId, card_id: ctx.cardId, note, source: 'import', import_id: ctx.importId,
      created_at: ctx.now, pay_month: ctx.payMonth, plan_key: null, inst_no: null, projected: false,
    };
    if (!inst) { out.push(base); continue; }
    let key = planKey(ctx.cardId, r.date, inst.of, r.amount, r.description);
    const planned = existing.find((x) => x.plan_key === key && x.inst_no === inst.n && x.projected)
      ?? findPlannedLoose(existing, out, ctx, inst.n, inst.of, r);
    // Some banks (İş Bankası) print the posting date instead of the purchase date, so the same
    // purchase can carry a different date each month: then keep the plan we already have.
    if (planned?.plan_key) key = planned.plan_key;
    // reuse the planned row's id so it is overwritten, not duplicated
    out.push({ ...base, id: planned ? planned.id : base.id, plan_key: key, inst_no: inst.n });
    const startMonth = ctx.payMonth || r.date.slice(0, 7);
    for (let k = inst.n + 1; k <= inst.of; k++) {
      if (has(key, k)) continue;
      out.push({
        ...base, id: ctx.uid(), source: 'projected', projected: true, plan_key: key, inst_no: k,
        pay_month: shiftMonth(startMonth, k - inst.n), note: r.description + ` (${k}/${inst.of})`,
      });
    }
  }
  return out;
}

/** A planned installment of the same purchase whose stored date differs (same card, count, merchant, ±1 TL). */
function findPlannedLoose(existing: Txn[], out: Txn[], ctx: ImportCtx, n: number, of: number, r: ImportRow): Txn | undefined {
  const mk = merchantKey(r.description);
  const cands = existing.filter((x) => {
    if (!x.projected || x.inst_no !== n || !x.plan_key || (x.card_id || null) !== (ctx.cardId || null)) return false;
    if (out.some((o) => o.id === x.id)) return false;
    const parts = x.plan_key.split('|');
    return +parts[2] === of && parts.slice(4).join('|') === mk && Math.abs(x.amount - r.amount) <= 1;
  });
  return cands.find((x) => x.pay_month === ctx.payMonth) ?? cands[0];
}

/**
 * Undo an import. Rows of a purchase that other imports still know about turn back into
 * planned installments instead of disappearing.
 */
export function planUndo(importTxns: Txn[], all: Txn[], importId: string): { remove: string[]; restore: Txn[] } {
  const removing = new Set(importTxns.map((x) => x.id));
  const remove: string[] = [];
  const restore: Txn[] = [];
  for (const x of importTxns) {
    const other = x.plan_key ? all.find((y) => y.plan_key === x.plan_key && !removing.has(y.id) && !y.projected) : null;
    if (other && !x.projected && (x.inst_no || 0) > (other.inst_no || 0)) {
      restore.push({ ...x, projected: true, source: 'projected', import_id: other.import_id ?? null });
    } else remove.push(x.id);
  }
  void importId;
  return { remove, restore };
}
