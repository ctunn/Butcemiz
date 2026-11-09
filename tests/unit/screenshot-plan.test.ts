import { describe, it, expect } from 'vitest';
import type { Txn } from '../../src/types';
import { findProvisional, isPlannedInstallment, planKey } from '../../src/lib/installments';

const tx = (p: Partial<Txn>): Txn => ({ id: Math.random().toString(), kind: 'expense', amount: 10, date: '2026-11-02', category_id: 'shopping', person_id: 'p1', card_id: 'g', note: '', source: 'import', created_at: '', ...p });

describe('screenshots and installment plans', () => {
  const key = planKey('g', '2026-07-26', 6, 383, 'ORNEK MAGAZA');
  const plan = [1, 2, 3, 4, 5, 6].map((n) => tx({ amount: 383, plan_key: key, inst_no: n, projected: n > 3, date: '2026-07-26', note: 'ORNEK MAGAZA' }));
  it('a later installment seen in the app is already planned', () => {
    const r = { date: '2026-10-26', description: 'ORNEK MAGAZA VE TEKST', amount: 383, kind: 'expense' as const, category: '', installment: '4/6' };
    expect(isPlannedInstallment(r, 'g', plan)).toBe(true);
    expect(isPlannedInstallment({ ...r, installment: '4/8' }, 'g', plan)).toBe(false);
    expect(isPlannedInstallment({ ...r, installment: '1/6' }, 'g', plan)).toBe(false);
    expect(isPlannedInstallment(r, 'other', plan)).toBe(false);
  });
  it('a statement row replaces a screenshot installment even when the dates differ', () => {
    const k = planKey('g', '2026-10-05', 3, 300, 'X');
    const shot = tx({ source: 'screenshot', amount: 300, date: '2026-10-28', plan_key: k, inst_no: 1 });
    expect(findProvisional([shot], new Set(), 'g', { date: '2026-10-05', amount: 300, kind: 'expense', installment: '1/3' })?.id).toBe(shot.id);
    expect(findProvisional([shot], new Set(), 'g', { date: '2026-10-05', amount: 300, kind: 'expense' })).toBeUndefined();
  });
});
