import { useSyncExternalStore } from 'react';
import type { Data, TableName, Lang } from '../types';
import type { Backend } from './backend';
import { LocalBackend, readLocal } from './local';

export interface Prefs { lang: Lang; currency: string; defaultPersonId: string | null; monthBasis: 'pay' | 'purchase' }
const PREFS_KEY = 'budget-prefs';

function loadPrefs(): Prefs {
  // Turkish is the household's native language: default to it until the user picks one in Settings.
  const nav: Lang = 'tr';
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { lang: p.lang || nav, currency: p.currency || 'TRY', defaultPersonId: p.defaultPersonId ?? 'p1', monthBasis: p.monthBasis === 'purchase' ? 'purchase' : 'pay' };
  } catch { return { lang: nav, currency: 'TRY', defaultPersonId: 'p1', monthBasis: 'pay' }; }
}

export interface State { data: Data; prefs: Prefs; mode: 'local' | 'cloud'; syncing: boolean; error: string | null }

let state: State = { data: readLocal(), prefs: loadPrefs(), mode: 'local', syncing: false, error: null };
let backend: Backend = new LocalBackend();
let unsub: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }
function set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); }

export const store = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },

  async useBackend(b: Backend) {
    unsub?.();
    backend = b;
    set({ mode: b.kind, syncing: true, error: null });
    try {
      const data = await b.load();
      set({ data, syncing: false });
      unsub = b.subscribe ? b.subscribe(() => store.reload()) : null;
    } catch (e: any) {
      set({ syncing: false, error: e?.message || String(e) });
    }
  },

  async reload() {
    try { set({ data: await backend.load() }); } catch (e: any) { set({ error: e?.message || String(e) }); }
  },

  async upsert<T extends TableName>(table: T, rows: Data[T]) {
    const list = [...(state.data[table] as { id: string }[])];
    for (const r of rows as { id: string }[]) {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = r; else list.push(r);
    }
    const prev = state.data;
    set({ data: { ...state.data, [table]: list } });
    try { await backend.upsert(table, rows); }
    catch (e: any) { set({ data: prev, error: e?.message || String(e) }); throw e; }
  },

  async remove(table: TableName, ids: string[]) {
    const s = new Set(ids);
    const prev = state.data;
    set({ data: { ...state.data, [table]: (state.data[table] as { id: string }[]).filter((x) => !s.has(x.id)) } });
    try { await backend.remove(table, ids); }
    catch (e: any) { set({ data: prev, error: e?.message || String(e) }); throw e; }
  },

  /** Replace everything (used by backup restore and moving local data to the cloud). */
  async replaceAll(data: Data) {
    const tables: TableName[] = ['categories', 'people', 'cards', 'rules', 'txns'];
    for (const t of [...tables].reverse()) {
      const ids = (state.data[t] as { id: string }[]).map((x) => x.id);
      if (ids.length) await backend.remove(t, ids);
    }
    for (const t of tables) await backend.upsert(t, data[t] as any);
    set({ data: structuredClone(data) });
  },

  setPrefs(p: Partial<Prefs>) {
    const prefs = { ...state.prefs, ...p };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    set({ prefs });
  },

  clearError() { set({ error: null }); },
};

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get);
}
