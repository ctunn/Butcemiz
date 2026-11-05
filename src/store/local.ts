import { missingDefaultCats } from '../lib/defaults';
import type { Data, TableName } from '../types';
import type { Backend } from './backend';
import { emptyData } from '../lib/defaults';
import { demoData } from '../lib/demo';

export const LOCAL_KEY = 'budget-data-v1';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage full or blocked */ }
}

export function readLocal(): Data {
  const raw = safeGet(LOCAL_KEY);
  // Preview builds (VITE_DEMO=1) open with example data so there is something to look at.
  if (!raw) return import.meta.env.VITE_DEMO ? demoData() : emptyData();
  try {
    const d = JSON.parse(raw) as Partial<Data>;
    const base = emptyData();
    return {
      categories: d.categories?.length ? [...d.categories, ...missingDefaultCats(d.categories)] : base.categories,
      people: d.people?.length ? d.people : base.people,
      cards: d.cards ?? base.cards,
      txns: d.txns ?? [],
      rules: d.rules ?? [],
      shopping: d.shopping ?? [],
    };
  } catch {
    return emptyData();
  }
}

export function writeLocal(d: Data) { safeSet(LOCAL_KEY, JSON.stringify(d)); }

export class LocalBackend implements Backend {
  kind = 'local' as const;
  private data: Data = readLocal();
  async load() { this.data = readLocal(); return structuredClone(this.data); }
  async upsert<T extends TableName>(table: T, rows: Data[T]) {
    const list = this.data[table] as { id: string }[];
    for (const r of rows as { id: string }[]) {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = r; else list.push(r);
    }
    writeLocal(this.data);
  }
  async remove(table: TableName, ids: string[]) {
    const set = new Set(ids);
    (this.data as any)[table] = (this.data[table] as { id: string }[]).filter((x) => !set.has(x.id));
    writeLocal(this.data);
  }
}
