import { useRef, useState } from 'react';
import { store, useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { Empty, Icon, Segmented, askConfirm, toast } from '../components/ui';
import { parseAmount } from '../lib/money';
import { uid } from '../lib/id';
import type { ShopItem, ShopList } from '../types';

const LIST_KEY = 'budget-shop-list';

/** Shared shopping list: both phones see the same list live. */
export function Shopping() {
  const { data, prefs } = useStore();
  const t = useT();
  const h = useHelpers();
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [list, setListState] = useState<ShopList>(() => { try { return (localStorage.getItem(LIST_KEY) as ShopList) || 'daily'; } catch { return 'daily'; } });
  const setList = (l: ShopList) => { setListState(l); try { localStorage.setItem(LIST_KEY, l); } catch { /* ignore */ } };
  const inputRef = useRef<HTMLInputElement>(null);
  const priced = list !== 'daily';
  const all = data.shopping || [];
  const items = all.filter((x) => (x.list || 'daily') === list);
  const count = (l: ShopList) => all.filter((x) => (x.list || 'daily') === l && !x.done).length;
  const open = items.filter((x) => !x.done).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = items.filter((x) => x.done).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const run = async (f: () => Promise<void>) => { try { await f(); } catch (e: any) { if (e?.message !== 'schemaOld') toast(t('error') + ': ' + (e?.message || e), 'err'); } };

  const add = () => {
    // "süt, ekmek, yumurta" adds three items
    const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const now = Date.now();
    const p = priced && names.length === 1 ? parseAmount(price) : null;
    const rows: ShopItem[] = names.map((name, i) => ({ id: uid(), name: name.slice(0, 80), done: false, person_id: prefs.defaultPersonId, created_at: new Date(now + i).toISOString(), list, price: p && p > 0 ? Math.round(p * 100) / 100 : null }));
    setText(''); setPrice('');
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
          {x.price ? <span className="shop-price">{h.money(x.price, true)}</span> : null}
          {p && <span className="dot" style={{ background: p.color }} title={p.name} aria-label={p.name} />}
        </label>
        <button className="shop-del" onClick={() => del(x)} aria-label={t('delete') + ' ' + x.name}><Icon name="close" size={18} /></button>
      </li>
    );
  };

  return (
    <div className="screen">
      <Segmented<ShopList> value={list} onChange={setList} options={(['daily', 'wish', 'needed'] as ShopList[]).map((l) => ({ value: l, label: t('shopList_' + l as any) + (count(l) ? ` · ${count(l)}` : '') }))} />
      <form className="shop-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={t(('shopPh_' + list) as any)} aria-label={t('shopAdd')} enterKeyHint="done" autoComplete="off" />
        {priced && <input className="shop-price-in" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder={t('shopPrice')} aria-label={t('shopPrice')} />}
        <button type="submit" className="btn primary" disabled={!text.trim()} aria-label={t('shopAdd')}><Icon name="plus" size={22} stroke={2.4} /></button>
      </form>

      {items.length === 0 ? (
        <Empty title={t('shopEmpty')} hint={t(('shopHint_' + list) as any)} icon={list === 'wish' ? '✨' : list === 'needed' ? '🔧' : '🛒'} />
      ) : (
        <>
          <section className="card">
            <div className="card-head">
              <h3>{t('shopToBuy')} <span className="muted small">· {open.length}</span></h3>
              {priced && open.some((x) => x.price) && <span className="shop-total">{t('total')}: {h.money(open.reduce((a, x) => a + (x.price || 0), 0), true)}</span>}
            </div>
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
