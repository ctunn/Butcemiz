import { useEffect, useState } from 'react';
import { store, useStore } from '../store/store';
import { useT } from '../i18n';
import { toast } from '../components/ui';
import { CloudBackend, getCloudConfig, myHousehold, setCloudConfig, supa } from '../store/cloud';
import { LocalBackend, readLocal } from '../store/local';
import { emptyData } from '../lib/defaults';

/** Connects this phone to a shared Supabase "household" so both partners see the same data. */
export function SyncPanel() {
  const { mode } = useStore();
  const t = useT();
  const [cfg, setCfg] = useState(getCloudConfig() || { url: '', anonKey: '' });
  const [hasCfg, setHasCfg] = useState(!!getCloudConfig());
  const [user, setUser] = useState<string | null>(null);
  const [household, setHousehold] = useState<{ id: string; name: string; invite_code: string } | null>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [hhName, setHhName] = useState('Ev');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const s = supa();
    if (!s) return;
    const { data } = await s.auth.getUser();
    setUser(data.user?.email ?? null);
    if (data.user) {
      try { setHousehold(await myHousehold()); } catch (e: any) { toast(e.message, 'err'); }
    }
  };
  useEffect(() => { if (hasCfg) refresh(); }, [hasCfg]);

  const wrap = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast(t('error') + ': ' + (e?.message || e), 'err'); } finally { setBusy(false); }
  };

  const connect = wrap(async () => {
    const url = cfg.url.trim().replace(/\/$/, '');
    if (!/^https:\/\/.+/.test(url) || cfg.anonKey.trim().length < 20) throw new Error('URL / key');
    setCloudConfig({ url, anonKey: cfg.anonKey.trim() });
    setHasCfg(true);
  });

  const auth = (signup: boolean) => wrap(async () => {
    const s = supa()!;
    const r = signup ? await s.auth.signUp({ email, password: pw }) : await s.auth.signInWithPassword({ email, password: pw });
    if (r.error) throw r.error;
    if (signup && !r.data.session) toast(t('checkEmail'));
    await refresh();
  });

  const start = async (hhId: string) => {
    await store.useBackend(new CloudBackend(supa()!, hhId));
  };

  const create = wrap(async () => {
    const s = supa()!;
    const { data, error } = await s.rpc('create_household', { p_name: hhName || 'Ev' });
    if (error) throw error;
    const hh = await myHousehold();
    setHousehold(hh);
    // Seed default categories/people/cards, or this phone's existing data.
    const local = readLocal();
    const cloud = new CloudBackend(s, data as string);
    const seed = local.txns.length ? local : emptyData();
    for (const tname of ['categories', 'people', 'cards', 'rules', 'txns'] as const) await cloud.upsert(tname, seed[tname] as any);
    await start(data as string);
  });

  const join = wrap(async () => {
    const s = supa()!;
    const { data, error } = await s.rpc('join_household', { p_code: code.trim().toUpperCase() });
    if (error) throw error;
    setHousehold(await myHousehold());
    await start(data as string);
  });

  const signOut = wrap(async () => {
    await supa()?.auth.signOut();
    setUser(null); setHousehold(null);
    await store.useBackend(new LocalBackend());
  });

  const disconnect = wrap(async () => {
    await supa()?.auth.signOut().catch(() => {});
    setCloudConfig(null); setHasCfg(false); setUser(null); setHousehold(null);
    await store.useBackend(new LocalBackend());
  });

  return (
    <div className="sync">
      <p className="muted small">{mode === 'cloud' ? '🟢 ' + t('syncCloud') + (household ? ` · ${household.name}` : '') : '📱 ' + t('syncLocal')}</p>
      {!hasCfg && (
        <details>
          <summary className="btn block">{t('syncSetup')}</summary>
          <label className="field"><span>{t('supaUrl')}</span><input value={cfg.url} placeholder="https://xxxx.supabase.co" onChange={(e) => setCfg({ ...cfg, url: e.target.value })} autoCapitalize="off" /></label>
          <label className="field"><span>{t('supaKey')}</span><input value={cfg.anonKey} onChange={(e) => setCfg({ ...cfg, anonKey: e.target.value })} autoCapitalize="off" /></label>
          <button className="btn primary block" disabled={busy} onClick={connect}>{t('connect')}</button>
        </details>
      )}
      {hasCfg && !user && (
        <div className="stack">
          <label className="field"><span>{t('email')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="off" autoComplete="email" /></label>
          <label className="field"><span>{t('password')}</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
          <div className="row2">
            <button className="btn primary" disabled={busy} onClick={auth(false)}>{t('signIn')}</button>
            <button className="btn" disabled={busy} onClick={auth(true)}>{t('signUp')}</button>
          </div>
          <button className="link danger" onClick={disconnect}>{t('disconnect')}</button>
        </div>
      )}
      {hasCfg && user && !household && (
        <div className="stack">
          <p className="small">{user}</p>
          <label className="field"><span>{t('householdName')}</span><input value={hhName} onChange={(e) => setHhName(e.target.value)} /></label>
          <button className="btn primary block" disabled={busy} onClick={create}>{t('createHousehold')}</button>
          <label className="field"><span>{t('inviteCode')}</span><input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" /></label>
          <button className="btn block" disabled={busy || code.length < 4} onClick={join}>{t('joinHousehold')}</button>
          <button className="link" onClick={signOut}>{t('signOut')}</button>
        </div>
      )}
      {hasCfg && user && household && (
        <div className="stack">
          <p className="small">{user}</p>
          <p className="small">{t('shareCode')} <b className="code">{household.invite_code}</b></p>
          {mode !== 'cloud' && <button className="btn primary block" onClick={wrap(() => start(household.id))}>{t('connect')}</button>}
          <button className="link" onClick={signOut}>{t('signOut')}</button>
        </div>
      )}
    </div>
  );
}

/** On app start, resume the cloud session if this phone was connected. */
export async function resumeSync() {
  const s = supa();
  if (!s) return;
  try {
    const { data } = await s.auth.getSession();
    if (!data.session) return;
    const hh = await myHousehold();
    if (hh) await store.useBackend(new CloudBackend(s, hh.id));
  } catch { /* offline: keep cached local data */ }
}
