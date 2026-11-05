import { describe, it, expect } from 'vitest';
import { byCategory, filterTxns, monthlyTrend, totals, txnMonth } from '../../src/lib/stats';
import { payMonthFor } from '../../src/lib/paymonth';
import { DEFAULT_CATEGORIES, HOME_GROUP, missingDefaultCats } from '../../src/lib/defaults';
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


import { buildImport, planUndo, isInstallmentDuplicate, buildRecurring, recurringInfo, syncPlan, repairPlans } from '../../src/lib/installments';

describe('installment planning', () => {
  let n = 0;
  const ctx = (payMonth: string, importId: string) => ({ cardId: 'g', personId: 'p1', payMonth, importId, now: '2026-11-04T00:00:00Z', uid: () => 'id' + n++ });
  const row = (inst: string, amount = 2190.3) => ({ date: '2026-10-17', description: 'BAUHAUS İNŞAAT MALZEMELER', amount, kind: 'expense' as const, category: 'housing', installment: inst });

  it('plans the remaining installments in the following payment months', () => {
    const out = buildImport([row('1/6')], [], ctx('2026-11', 'imp1'));
    expect(out).toHaveLength(6);
    expect(out[0]).toMatchObject({ inst_no: 1, projected: false, pay_month: '2026-11' });
    expect(out.slice(1).map((x) => [x.inst_no, x.pay_month, x.projected])).toEqual([
      [2, '2026-12', true], [3, '2027-01', true], [4, '2027-02', true], [5, '2027-03', true], [6, '2027-04', true]]);
    expect(totals(filterTxns(out, { month: '2027-01', basis: 'pay' })).expense).toBe(2190.3);
  });

  it('next statement replaces the planned installment instead of doubling it', () => {
    const first = buildImport([row('1/6')], [], ctx('2026-11', 'imp1'));
    const plannedDec = first.find((x) => x.inst_no === 2)!;
    expect(isInstallmentDuplicate(row('2/6'), 'g', first)).toBe(false); // planned, not imported yet
    const second = buildImport([row('2/6', 2190.29)], first, ctx('2026-12', 'imp2'));
    expect(second).toHaveLength(1); // no new plans: 3..6 already exist
    expect(second[0]).toMatchObject({ id: plannedDec.id, projected: false, import_id: 'imp2', pay_month: '2026-12', amount: 2190.29 });
    // merge like the store does
    const all = first.map((x) => (x.id === second[0].id ? second[0] : x));
    expect(totals(filterTxns(all, { month: '2026-12', basis: 'pay' })).expense).toBe(2190.29);
    expect(all.filter((x) => x.pay_month === '2026-12')).toHaveLength(1);
    expect(isInstallmentDuplicate(row('2/6'), 'g', all)).toBe(true); // importing December again is a duplicate
  });

  it('bank printing the posting date each month (İş Bankası): still replaced, never doubled', () => {
    const r = (inst: string, date: string) => ({ date, description: 'NEOVA KATILIM SI(' + inst + ' TK)', amount: 2613.57, kind: 'expense' as const, category: 'other', installment: inst });
    const oct = buildImport([r('4/9', '2026-09-05')], [], ctx('2026-10', 'i1'));
    expect(oct).toHaveLength(6); // 4 real + 5..9 planned
    const nov = buildImport([r('5/9', '2026-10-05')], oct, ctx('2026-11', 'i2'));
    expect(nov).toHaveLength(1);
    expect(nov[0].id).toBe(oct.find((x) => x.inst_no === 5)!.id);
    const all = oct.map((x) => (x.id === nov[0].id ? nov[0] : x));
    expect(all.filter((x) => x.pay_month === '2026-11')).toHaveLength(1);
    expect(totals(filterTxns(all, { month: '2026-11', basis: 'pay' })).expense).toBe(2613.57);
    // the same November statement imported again is recognised
    expect(isInstallmentDuplicate(r('5/9', '2026-10-05'), 'g', all, '2026-11')).toBe(true);
    // December's statement replaces December's plan
    const dec = buildImport([r('6/9', '2026-11-05')], all, ctx('2026-12', 'i3'));
    expect(dec).toHaveLength(1);
    expect(dec[0].id).toBe(oct.find((x) => x.inst_no === 6)!.id);
  });

  it('undoing the newer import turns its row back into a plan', () => {
    const first = buildImport([row('1/6')], [], ctx('2026-11', 'imp1'));
    const second = buildImport([row('2/6')], first, ctx('2026-12', 'imp2'));
    const all = first.map((x) => (x.id === second[0].id ? second[0] : x));
    const u = planUndo(all.filter((x) => x.import_id === 'imp2'), all, 'imp2');
    expect(u.remove).toEqual([]);
    expect(u.restore[0]).toMatchObject({ inst_no: 2, projected: true, import_id: 'imp1' });
    const u1 = planUndo(all.filter((x) => x.import_id === 'imp1'), all, 'imp1');
    expect(u1.remove).toHaveLength(5); // inst 1 + plans 3..6
  });

  it('ignores rows without a full n/N installment', () => {
    expect(buildImport([row('?/6')], [], ctx('2026-11', 'i'))).toHaveLength(1);
    expect(buildImport([{ ...row('1/6'), kind: 'income' }], [], ctx('2026-11', 'i'))).toHaveLength(1);
  });
});

describe('monthly repeat (loan) and the Home group', () => {
  let n = 0;
  const uid = () => 'r' + n++;
  const loan = (): Txn => ({ id: 'loan1', kind: 'expense', amount: 12500, date: '2026-10-15', category_id: 'loan', person_id: 'p1', card_id: null, note: 'Konut kredisi', source: 'manual', created_at: '2026-10-15T00:00:00Z', pay_month: null });

  it('plans the following months and keeps the day of month', () => {
    const rows = buildRecurring(loan(), 3, uid);
    expect(rows.map((x) => [x.date, x.inst_no, !!x.projected])).toEqual([
      ['2026-10-15', 1, false], ['2026-11-15', 2, true], ['2026-12-15', 3, true], ['2027-01-15', 4, true]]);
    expect(recurringInfo(rows[2])).toEqual({ n: 3, of: 4 });
    expect(totals(filterTxns(rows, { month: '2026-12', basis: 'pay' })).expense).toBe(12500);
  });

  it('account statement payment replaces that month\'s plan, not another month', () => {
    const plan = buildRecurring(loan(), 3, uid);
    const ctx = { cardId: 'a-isbank-p1', personId: 'p1', payMonth: null, importId: 'acc1', now: 'x', uid };
    const out = buildImport([{ date: '2026-11-15', description: 'KREDI TAKSIT ODEMESI', amount: 12500, kind: 'expense', category: 'loan' }], plan, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: plan[1].id, projected: false, inst_no: 2, card_id: 'a-isbank-p1' });
    const all = plan.map((x) => (x.id === out[0].id ? out[0] : x));
    expect(filterTxns(all, { month: '2026-11', basis: 'pay' })).toHaveLength(1);
    // a different amount in December does not touch the plan
    const other = buildImport([{ date: '2026-12-03', description: 'MARKET', amount: 300, kind: 'expense', category: 'groceries' }], all, ctx);
    expect(other[0].id).not.toBe(plan[2].id);
  });

  it('Home group shows shared rows of both people', () => {
    const rows: Txn[] = [
      { ...loan(), id: 'a', shared: true, person_id: 'p1', category_id: 'home_bills', amount: 100 },
      { ...loan(), id: 'b', shared: true, person_id: 'p2', category_id: 'home_shopping', amount: 50 },
      { ...loan(), id: 'c', shared: false, person_id: 'p1', category_id: 'dining', amount: 70 },
    ];
    const home = filterTxns(rows, { month: '2026-10', personId: HOME_GROUP });
    expect(home.map((x) => x.id)).toEqual(['a', 'b']);
    expect(filterTxns(rows, { month: '2026-10', personId: 'p1' }).map((x) => x.id)).toEqual(['c']); // Ev rows belong to the home, not to who paid
    expect(filterTxns(rows, { month: '2026-10' })).toHaveLength(3); // everyone still sees all
  });

  it('existing households get the new home categories', () => {
    expect(missingDefaultCats([{ id: 'groceries' } as any]).map((x) => x.id)).toEqual(['home_bills', 'home_shopping']);
    expect(missingDefaultCats([])).toEqual([]);
  });
});

describe('category and Ev flag follow the whole installment purchase', () => {
  let n = 0;
  const ctx = (payMonth: string, importId: string) => ({ cardId: 'g', personId: 'p1', payMonth, importId, now: 'x', uid: () => 'q' + n++ });
  const row = (inst: string, category = 'other') => ({ date: '2026-10-17', description: 'BAUHAUS İNŞAAT', amount: 2190.3, kind: 'expense' as const, category, suggested: 'other', installment: inst });

  it('editing one month updates the planned months, and next statement keeps the choice', () => {
    const first = buildImport([row('1/6')], [], ctx('2026-11', 'i1'));
    const edited = { ...first[0], category_id: 'home_shopping', shared: true };
    const follow = syncPlan([edited], first);
    expect(follow).toHaveLength(5);
    expect(follow.every((x) => x.category_id === 'home_shopping' && x.shared && x.projected)).toBe(true);
    const all = first.map((x) => (x.id === edited.id ? edited : follow.find((f) => f.id === x.id) ?? x));
    const dec = buildImport([row('2/6')], all, ctx('2026-12', 'i2')); // suggested 'other' again
    expect(dec).toHaveLength(1);
    expect(dec[0]).toMatchObject({ category_id: 'home_shopping', shared: true, projected: false });
    const merged = all.map((x) => (x.id === dec[0].id ? dec[0] : x));
    expect(filterTxns(merged, { month: '2026-12', personId: HOME_GROUP, basis: 'pay' }).map((x) => x.id)).toEqual([dec[0].id]);
    expect(filterTxns(merged, { month: '2026-12', basis: 'pay' })).toHaveLength(1); // not doubled
  });

  it('a category picked on the import screen wins and is passed on', () => {
    const first = buildImport([row('1/6')], [], ctx('2026-11', 'i1'));
    const dec = buildImport([row('2/6', 'home_bills')], first, ctx('2026-12', 'i2'));
    expect(dec[0].category_id).toBe('home_bills');
    expect(syncPlan(dec, first).map((x) => x.inst_no)).toEqual([1, 3, 4, 5, 6]);
  });

  it('loan series: Ev flag on the first payment carries to the plans and to the imported payment', () => {
    const base: Txn = { id: 'L', kind: 'expense', amount: 1000, date: '2026-10-10', category_id: 'loan', person_id: 'p1', card_id: null, note: 'Kredi', source: 'manual', created_at: 'x', shared: true };
    const plan = buildRecurring(base, 2, () => 'L' + n++);
    expect(plan.every((x) => x.shared)).toBe(true);
    const imp = buildImport([{ date: '2026-11-10', description: 'KREDI', amount: 1000, kind: 'expense', category: 'other', suggested: 'other' }], plan, { ...ctx('', 'a'), cardId: 'acc', payMonth: null });
    expect(imp[0]).toMatchObject({ category_id: 'loan', shared: true, id: plan[1].id });
  });
});

import { findDuplicates } from '../../src/lib/dedupe';
describe('duplicate finder', () => {
  const t = (id: string, imp: string | null, extra: Partial<Txn> = {}): Txn => ({ id, kind: 'expense', amount: 2190.3, date: '2026-10-17', category_id: 'other', person_id: 'p1', card_id: 'g', note: 'BAUHAUS', source: imp ? 'import' : 'manual', import_id: imp, created_at: imp || 'm', pay_month: '2026-11', ...extra });
  it('finds a statement imported twice, keeps the copy with the plan', () => {
    const d = findDuplicates([t('a', 'i1'), t('b', 'i2', { plan_key: 'k', inst_no: 1 }), t('c', 'i1', { amount: 50 })]);
    expect(d.map((x) => x.id)).toEqual(['a']);
  });
  it('two equal purchases on one statement are not duplicates', () => {
    expect(findDuplicates([t('a', 'i1'), t('b', 'i1')])).toEqual([]);
  });
  it('a hand-typed row that the statement also brought is a duplicate; planned rows are ignored', () => {
    expect(findDuplicates([t('m', null), t('a', 'i1')]).map((x) => x.id)).toEqual(['m']); // the statement copy stays
    expect(findDuplicates([t('p', null, { projected: true }), t('a', 'i1')])).toEqual([]);
  });
});

describe('duplicate finder: planned copies', () => {
  it('a planned row whose installment is already real is extra', () => {
    const base = { kind: 'expense' as const, amount: 100, category_id: 'home_shopping', person_id: 'p1', card_id: 'g', note: 'X', created_at: 'x', plan_key: 'k' };
    const d = findDuplicates([
      { ...base, id: 'r', date: '2026-10-01', source: 'import', import_id: 'i', inst_no: 2, pay_month: '2026-11' },
      { ...base, id: 'p', date: '2026-10-01', source: 'projected', projected: true, inst_no: 2, pay_month: '2026-11' },
      { ...base, id: 'q', date: '2026-10-01', source: 'projected', projected: true, inst_no: 3, pay_month: '2026-12' },
    ] as Txn[]);
    expect(d.map((x) => x.id)).toEqual(['p']);
  });
});

describe('repair installment rows saved before plans existed', () => {
  const old = (id: string, note: string, extra: Partial<Txn> = {}): Txn => ({ id, kind: 'expense', amount: 2190.3, date: '2026-10-17', category_id: 'home_shopping', person_id: 'p1', card_id: 'g', note, source: 'import', import_id: 'i0', created_at: 'x', pay_month: '2026-11', shared: true, ...extra });
  it('adds the missing months with the same category and Ev flag', () => {
    const fix = repairPlans([old('a', 'BAUHAUS İNŞAAT (2/6)')]);
    expect(fix.map((x) => [x.id, x.inst_no, x.pay_month, !!x.projected])).toEqual([
      ['a', 2, '2026-11', false], ['a-p3', 3, '2026-12', true], ['a-p4', 4, '2027-01', true], ['a-p5', 5, '2027-02', true], ['a-p6', 6, '2027-03', true]]);
    expect(fix.every((x) => x.category_id === 'home_shopping' && x.shared)).toBe(true);
    // once repaired nothing more happens; same ids if two phones repair at once
    const all = fix;
    expect(repairPlans(all)).toEqual([]);
    expect(repairPlans([old('a', 'BAUHAUS İNŞAAT (2/6)')]).map((x) => x.id)).toEqual(fix.map((x) => x.id));
  });
  it('does not plan months that already exist and ignores last installments and plain rows', () => {
    const later = old('b', 'BAUHAUS İNŞAAT (3/6)', { plan_key: 'g|2026-10-17|6|2190|bauhaus insaat', inst_no: 3, pay_month: '2026-12' });
    const fix = repairPlans([old('a', 'BAUHAUS İNŞAAT (2/6)'), later, old('c', 'MIGROS (6/6)'), old('d', 'MARKET')]);
    expect(fix.map((x) => x.id)).toEqual(['a', 'a-p4', 'a-p5', 'a-p6', 'c']);
  });
});
