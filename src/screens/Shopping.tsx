import { useRef, useState } from 'react';
import { store, useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { Empty, Icon, askConfirm, toast } from '../components/ui';
import { uid } from '../lib/id';
import type { ShopItem } from '../types';

/** Shared shopping list: both phones see the same list live. */
export function Shopping() {
  const { data, prefs } = useStore();
  const t = useT();
  const h = useHelpers();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const items = data.shopping || [];
  const open = items.filter((x) => !x.done).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = items.filter((x) => x.done).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const run = async (f: () => Promise<void>) => { try { await f(); } catch (e: any) { if (e?.message !== 'schemaOld') toast(t('error') + ': ' + (e?.message || e), 'err'); } };

  const add = () => {
    // "süt, ekmek, yumurta" adds three items
    const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const now = Date.now();
    const rows: ShopItem[] = names.map((name, i) => ({ id: uid(), name: name.slice(0, 80), done: false, person_id: prefs.defaultPersonId, created_at: new Date(now + i).toISOString() }));
    setText('');
    inputRef.current?.focus();
    run(() => store.upsert('shopping', rows));
  };
  const toggle = (x: ShopItem) => run(() => store.upsert('shopping', [{ ...x, done: !x.done }]));
  const del = (x: ShopItem) => run(() => store.remove('shopping', [x.id]));
  const clearDone = async () => { if (await askConfirm(t('shopClearConfirm', { n: done.length }))) run(() => store.remove('shopping', done.map((x) => x.id))); };

  const row = (x: ShopItem) => {
    const p = h.person(x.person_id);
    return (
      <li key={x.id} className={'shop-item' + (x.done ? ' done' : '')}>
        <label className="shop-check">
          <input type="checkbox" checked={x.done} onChange={() => toggle(x)} />
          <span className="shop-name">{x.name}</span>
          {p && <span className="dot" style={{ background: p.color }} title={p.name} aria-label={p.name} />}
        </label>
        <button className="shop-del" onClick={() => del(x)} aria-label={t('delete') + ' ' + x.name}><Icon name="close" size={18} /></button>
      </li>
    );
  };

  return (
    <div className="screen">
      <form className="shop-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('shopPlaceholder')} aria-label={t('shopAdd')} enterKeyHint="done" autoComplete="off" />
        <button type="submit" className="btn primary" disabled={!text.trim()} aria-label={t('shopAdd')}><Icon name="plus" size={22} stroke={2.4} /></button>
      </form>

      {items.length === 0 ? (
        <Empty title={t('shopEmpty')} hint={t('shopEmptyHint')} icon="🛒" />
      ) : (
        <>
          <section className="card">
            <h3>{t('shopToBuy')} <span className="muted small">· {open.length}</span></h3>
            {open.length ? <ul className="shop-list">{open.map(row)}</ul> : <p className="muted small">{t('shopAllDone')}</p>}
          </section>
          {done.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h3>{t('shopBought')} <span className="muted small">· {done.length}</span></h3>
                <button className="link" onClick={clearDone}>{t('shopClear')}</button>
              </div>
              <ul className="shop-list">{done.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
