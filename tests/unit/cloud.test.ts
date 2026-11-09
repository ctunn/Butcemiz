import { describe, it, expect } from 'vitest';
import { CloudBackend } from '../../src/store/cloud';

describe('cloud upsert', () => {
  it('sends every row with the same columns and real booleans', async () => {
    const sent: any[] = [];
    const fake: any = { from: () => ({ upsert: async (p: any[]) => { sent.push(...p); return { error: null }; } }) };
    const b = new CloudBackend(fake, 'h1');
    await b.upsert('txns', [
      { id: 'a', kind: 'expense', amount: 1, date: '2026-11-01', category_id: 'home_bills', shared: true } as any,
      { id: 'b', kind: 'expense', amount: 2, date: '2026-11-01', category_id: 'groceries', pay_month: '2026-12' } as any,
    ]);
    expect(sent[0].shared).toBe(true);
    expect(sent[1].shared).toBe(false);
    expect(sent[1].projected).toBe(false);
    expect(sent[0].pay_month).toBeNull();
    expect(Object.keys(sent[0]).sort()).toEqual(Object.keys(sent[1]).sort());
  });
});
