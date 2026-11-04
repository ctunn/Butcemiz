import { useMemo } from 'react';
import { useStore } from './store/store';
import type { Category } from './types';
import { formatMoney } from './lib/money';

export function useHelpers() {
  const { data, prefs } = useStore();
  return useMemo(() => {
    const catMap = new Map(data.categories.map((c) => [c.id, c]));
    const personMap = new Map(data.people.map((p) => [p.id, p]));
    const cardMap = new Map(data.cards.map((c) => [c.id, c]));
    return {
      lang: prefs.lang,
      currency: prefs.currency,
      catName: (c: Category | undefined) => (c ? (prefs.lang === 'tr' ? c.name_tr : c.name_en) : '—'),
      cat: (id: string) => catMap.get(id),
      person: (id: string | null) => (id ? personMap.get(id) : undefined),
      card: (id: string | null) => (id ? cardMap.get(id) : undefined),
      money: (n: number, compact = false) => formatMoney(n, prefs.currency, prefs.lang, compact),
    };
  }, [data, prefs]);
}
