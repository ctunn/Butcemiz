import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Data, TableName } from '../types';
import type { Backend } from './backend';
import { writeLocal } from './local';

export interface CloudConfig { url: string; anonKey: string }

const CFG_KEY = 'budget-cloud-config';
const TABLES: TableName[] = ['categories', 'people', 'cards', 'txns', 'rules'];

export function getCloudConfig(): CloudConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setCloudConfig(c: CloudConfig | null) {
  try { c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY); } catch { /* ignore */ }
  client = null;
}

let client: SupabaseClient | null = null;
export function supa(): SupabaseClient | null {
  const cfg = getCloudConfig();
  if (!cfg) return null;
  if (!client) client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export async function myHousehold(): Promise<{ id: string; name: string; invite_code: string } | null> {
  const s = supa();
  if (!s) return null;
  const { data: u } = await s.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await s.from('members').select('household_id, households(id, name, invite_code)').eq('user_id', u.user.id).maybeSingle();
  if (error) throw error;
  return (data as any)?.households ?? null;
}

export class CloudBackend implements Backend {
  kind = 'cloud' as const;
  constructor(private s: SupabaseClient, private householdId: string) {}

  async load(): Promise<Data> {
    const results = await Promise.all(TABLES.map((t) => this.s.from(t).select('*').eq('household_id', this.householdId)));
    const d: any = {};
    TABLES.forEach((t, i) => {
      if (results[i].error) throw results[i].error;
      d[t] = (results[i].data || []).map(({ household_id, ...rest }: any) => rest);
    });
    d.txns = d.txns.map((t: any) => ({ ...t, amount: Number(t.amount) }));
    writeLocal(d); // offline cache
    return d as Data;
  }

  async upsert<T extends TableName>(table: T, rows: Data[T]) {
    if (!rows.length) return;
    const payload = (rows as any[]).map((r) => ({ ...r, household_id: this.householdId }));
    let { error } = await this.s.from(table).upsert(payload, { onConflict: 'household_id,id' });
    // Database not yet updated with the v1.1 columns: save without them rather than failing.
    if (error && /pay_month|cut_day|due_day|plan_key|inst_no|projected|shared/.test(error.message || '')) {
      // planned installments can't be told apart without the new columns, so they are skipped
      const stripped = payload.filter((r) => !r.projected).map(({ pay_month, cut_day, due_day, plan_key, inst_no, projected, shared, ...rest }) => rest);
      ({ error } = await this.s.from(table).upsert(stripped, { onConflict: 'household_id,id' }));
      // tell the user: planned rows and the Ev flag are not being saved until schema.sql is re-run
      if (!error && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('budget-schema-old'));
    }
    if (error) throw error;
  }

  async remove(table: TableName, ids: string[]) {
    if (!ids.length) return;
    const { error } = await this.s.from(table).delete().in('id', ids).eq('household_id', this.householdId);
    if (error) throw error;
  }

  subscribe(onChange: () => void) {
    let timer: any;
    const ch = this.s.channel('household-' + this.householdId);
    for (const t of TABLES) {
      ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: t, filter: `household_id=eq.${this.householdId}` }, () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 400);
      });
    }
    ch.subscribe();
    return () => { this.s.removeChannel(ch); };
  }
}
