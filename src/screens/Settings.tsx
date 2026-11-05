import { useRef, useState } from 'react';
import { store, useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { Sheet, toast, Segmented, Icon, askConfirm } from '../components/ui';
import { SyncPanel } from './Sync';
import { CURRENCIES } from '../lib/money';
import { BANK_NAMES } from '../lib/banks';
import { PALETTE, emptyData } from '../lib/defaults';
import { demoData } from '../lib/demo';
import { uid } from '../lib/id';
import { findDuplicates } from '../lib/dedupe';
import type { BankId, Card, Category, Data, Kind, Lang, Person } from '../types';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function Settings() {
  const { data, prefs } = useStore();
  const t = useT();
  const h = useHelpers();
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [catKind, setCatKind] = useState<Kind>('expense');
  const restoreRef = useRef<HTMLInputElement>(null);

  const exportCsv = () => {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    // Turkish Excel expects ";" between columns and "," as the decimal mark.
    const tr = prefs.lang === 'tr';
    const sep = tr ? ';' : ',';
    const head = tr ? ['Tarih', 'Tür', 'Tutar', 'Kategori', 'Kişi', 'Ödeme', 'Not'] : ['date', 'type', 'amount', 'category', 'person', 'payment', 'note'];
    const lines = [head.join(sep)];
    for (const x of [...data.txns].sort((a, b) => a.date.localeCompare(b.date))) {
      const amt = tr ? x.amount.toFixed(2).replace('.', ',') : x.amount.toFixed(2);
      const kind = tr ? (x.kind === 'income' ? 'Gelir' : 'Gider') : x.kind;
      lines.push([x.date, kind, amt, esc(h.catName(h.cat(x.category_id))), esc(h.person(x.person_id)?.name || ''), esc(h.card(x.card_id)?.name || t('cash')), esc(x.note)].join(sep));
    }
    download(`budget-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };

  const restore = async (f?: File) => {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as Data;
      if (!Array.isArray(d.txns) || !Array.isArray(d.categories)) throw new Error('invalid backup');
      if (!(await askConfirm(t('restoreConfirm')))) return;
      await store.replaceAll({ categories: d.categories, people: d.people || [], cards: d.cards || [], txns: d.txns, rules: d.rules || [] });
      toast(t('saved'));
    } catch (e: any) { toast(t('error') + ': ' + (e?.message || e), 'err'); }
    if (restoreRef.current) restoreRef.current.value = '';
  };

  return (
    <div className="screen">
      <section className="card">
        <h3>{t('language')}</h3>
        <Segmented<Lang> value={prefs.lang} onChange={(lang) => store.setPrefs({ lang })} options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} />
        <label className="field"><span>{t('currency')}</span>
          <select value={prefs.currency} onChange={(e) => store.setPrefs({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </section>

      <section className="card">
        <h3>{t('sync')}</h3>
        <SyncPanel />
      </section>

      <section className="card">
        <div className="card-head"><h3>{t('people')}</h3><button className="link" onClick={() => setEditPerson({ id: uid(), name: '', color: PALETTE[data.people.length % PALETTE.length] })}>+ {t('addPerson')}</button></div>
        <ul className="rows">
          {data.people.map((p) => <li key={p.id}><button className="row-btn" onClick={() => setEditPerson(p)}><span className="row-icon avatar" style={{ background: p.color }}>{p.name.trim().charAt(0).toLocaleUpperCase('tr')}</span><span className="row-name">{p.name}</span><span className="chev"><Icon name="chev" size={18} stroke={2.4} /></span></button></li>)}
        </ul>
      </section>

      <section className="card">
        <div className="card-head"><h3>{t('cards')}</h3><button className="link" onClick={() => setEditCard({ id: uid(), name: '', bank: 'other', person_id: data.people[0]?.id ?? null, kind: 'card' })}>+ {t('addCard')}</button></div>
        <ul className="rows">
          {data.cards.map((c) => (
            <li key={c.id}><button className="row-btn" onClick={() => setEditCard(c)}><span className="row-icon">{c.kind === 'account' ? '🏦' : '💳'}</span><span className="row-name">{c.name}</span><span className="muted small">{h.person(c.person_id)?.name}</span><span className="chev"><Icon name="chev" size={18} stroke={2.4} /></span></button></li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>{t('categories')}</h3>
          <button className="link" onClick={() => setEditCat({ id: uid(), name_en: '', name_tr: '', icon: '🏷️', color: PALETTE[data.categories.length % PALETTE.length], kind: catKind })}>+ {t('addCategory')}</button>
        </div>
        <Segmented<Kind> value={catKind} onChange={setCatKind} options={[{ value: 'expense', label: t('expense') }, { value: 'income', label: t('income') }]} />
        <ul className="rows">
          {data.categories.filter((c) => c.kind === catKind).map((c) => (
            <li key={c.id} className={c.archived ? 'off' : ''}><button className="row-btn" onClick={() => setEditCat(c)}><span className="row-icon" style={{ background: c.color + '26' }}>{c.icon}</span><span className="row-name">{h.catName(c)}</span>{c.archived && <span className="muted small">{t('archived')}</span>}<span className="chev"><Icon name="chev" size={18} stroke={2.4} /></span></button></li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>{t('backup')}</h3>
        <div className="stack">
          <button className="btn block" onClick={() => download(`budget-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json')}>⬇️ {t('exportJson')}</button>
          <button className="btn block" onClick={exportCsv}>📊 {t('exportCsv')}</button>
          <button className="btn block" onClick={async () => {
            const d = findDuplicates(data.txns);
            if (!d.length) { toast(t('noDuplicates')); return; }
            const total = d.reduce((a, x) => a + x.amount, 0);
            const list = d.slice(0, 8).map((x) => `• ${x.date.slice(8, 10)}.${x.date.slice(5, 7)} ${(x.note || '').slice(0, 28)} ${h.money(x.amount)}`).join('\n') + (d.length > 8 ? '\n…' : '');
            if (!(await askConfirm(t('duplicatesFound', { n: d.length, amount: h.money(total) }) + '\n\n' + list))) return;
            try { await store.remove('txns', d.map((x) => x.id)); await store.repairPlans(); toast(t('deleted')); } catch (e: any) { toast(t('error') + ': ' + (e?.message || e), 'err'); }
          }}>🔍 {t('findDuplicates')}</button>
          <input ref={restoreRef} type="file" accept="application/json,.json" className="sr" id="restore" onChange={(e) => restore(e.target.files?.[0])} />
          <label htmlFor="restore" className="btn block">⬆️ {t('importJson')}</label>
          <button className="btn block" onClick={async () => { if (await askConfirm(t('restoreConfirm'))) { await store.replaceAll(demoData()); toast(t('saved')); } }}>🧪 {t('demoData')}</button>
          <button className="btn danger block" onClick={async () => { if (await askConfirm(t('resetConfirm'))) { await store.replaceAll(emptyData()); toast(t('deleted')); } }}>🗑️ {t('resetAll')}</button>
        </div>
      </section>

      <p className="muted small center">{t('installHint')}</p>
      <p className="muted small center">v1.0 · {__BUILD__}</p>

      <Sheet open={!!editPerson} onClose={() => setEditPerson(null)} title={t('people')}>
        {editPerson && <PersonForm p={editPerson} onDone={() => setEditPerson(null)} />}
      </Sheet>
      <Sheet open={!!editCard} onClose={() => setEditCard(null)} title={t('cards')}>
        {editCard && <CardForm c={editCard} onDone={() => setEditCard(null)} />}
      </Sheet>
      <Sheet open={!!editCat} onClose={() => setEditCat(null)} title={t('categories')}>
        {editCat && <CategoryForm c={editCat} onDone={() => setEditCat(null)} />}
      </Sheet>
    </div>
  );
}

function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="colors">
      {PALETTE.map((c) => <button type="button" key={c} className={'color' + (c === value ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} aria-pressed={c === value} />)}
    </div>
  );
}

function PersonForm({ p, onDone }: { p: Person; onDone: () => void }) {
  const t = useT();
  const { data } = useStore();
  const [v, setV] = useState(p);
  const exists = data.people.some((x) => x.id === p.id);
  const used = data.txns.some((x) => x.person_id === p.id) || data.cards.some((c) => c.person_id === p.id);
  return (
    <form className="form" onSubmit={async (e) => { e.preventDefault(); if (!v.name.trim()) return; await store.upsert('people', [{ ...v, name: v.name.trim() }]); onDone(); }}>
      <label className="field"><span>{t('name')}</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus required /></label>
      <ColorPick value={v.color} onChange={(color) => setV({ ...v, color })} />
      <div className="form-actions">
        {exists && !used && <button type="button" className="btn danger" onClick={async () => { await store.remove('people', [p.id]); onDone(); }}>{t('delete')}</button>}
        <button className="btn primary grow" type="submit">{t('save')}</button>
      </div>
    </form>
  );
}

function CardForm({ c, onDone }: { c: Card; onDone: () => void }) {
  const t = useT();
  const { data } = useStore();
  const [v, setV] = useState(c);
  const exists = data.cards.some((x) => x.id === c.id);
  return (
    <form className="form" onSubmit={async (e) => { e.preventDefault(); const name = v.name.trim() || BANK_NAMES[v.bank]; await store.upsert('cards', [{ ...v, name }]); onDone(); }}>
      <label className="field"><span>{t('bank')}</span>
        <select value={v.bank} onChange={(e) => setV({ ...v, bank: e.target.value as BankId, name: v.name || BANK_NAMES[e.target.value as BankId] })}>
          {Object.entries(BANK_NAMES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </label>
      <label className="field"><span>{t('cardKind')}</span>
        <select value={v.kind || 'card'} onChange={(e) => setV({ ...v, kind: e.target.value as 'card' | 'account' })}>
          <option value="card">{t('kindCard')}</option>
          <option value="account">{t('kindAccount')}</option>
        </select>
      </label>
      {(v.kind || 'card') === 'card' && (
        <div className="row2">
          <label className="field"><span>{t('cutDay')}</span>
            <input inputMode="numeric" value={v.cut_day ?? ''} placeholder="25" onChange={(e) => { const n = parseInt(e.target.value, 10); setV({ ...v, cut_day: n >= 1 && n <= 31 ? n : null }); }} />
          </label>
          <label className="field"><span>{t('dueDay')}</span>
            <input inputMode="numeric" value={v.due_day ?? ''} placeholder="4" onChange={(e) => { const n = parseInt(e.target.value, 10); setV({ ...v, due_day: n >= 1 && n <= 31 ? n : null }); }} />
          </label>
        </div>
      )}
      <label className="field"><span>{t('name')}</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={BANK_NAMES[v.bank]} /></label>
      <label className="field"><span>{t('owner')}</span>
        <select value={v.person_id || ''} onChange={(e) => setV({ ...v, person_id: e.target.value || null })}>
          {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="form-actions">
        {exists && <button type="button" className="btn danger" onClick={async () => {
          const n = data.txns.filter((x) => x.card_id === c.id).length;
          if (n && !(await askConfirm(t('cardDeleteConfirm', { n })))) return;
          if (n) await store.upsert('txns', data.txns.filter((x) => x.card_id === c.id).map((x) => ({ ...x, card_id: null })));
          await store.remove('cards', [c.id]); onDone();
        }}>{t('delete')}</button>}
        <button className="btn primary grow" type="submit">{t('save')}</button>
      </div>
    </form>
  );
}

const EMOJIS = ['🛒', '🍽️', '⛽', '💡', '🏠', '🛍️', '💊', '🎬', '📺', '📚', '🧸', '✈️', '💇', '🐾', '🎁', '📦', '💼', '⭐', '🏘️', '💰', '🚗', '☕', '🍺', '🏋️', '📱', '💻', '👶', '🎓', '🧾', '🏷️', '🎮', '🍼', '👗', '🔧', '🚌', '💳'];

function CategoryForm({ c, onDone }: { c: Category; onDone: () => void }) {
  const t = useT();
  const { data } = useStore();
  const [v, setV] = useState(c);
  const exists = data.categories.some((x) => x.id === c.id);
  const used = data.txns.some((x) => x.category_id === c.id);
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      const name_tr = v.name_tr.trim() || v.name_en.trim(); const name_en = v.name_en.trim() || name_tr;
      if (!name_tr) return;
      await store.upsert('categories', [{ ...v, name_tr, name_en }]); onDone();
    }}>
      <label className="field"><span>{t('name')} (TR)</span><input value={v.name_tr} onChange={(e) => setV({ ...v, name_tr: e.target.value })} /></label>
      <label className="field"><span>{t('name')} (EN)</span><input value={v.name_en} onChange={(e) => setV({ ...v, name_en: e.target.value })} /></label>
      <fieldset><legend>{t('icon')}</legend>
        <div className="emojis">{EMOJIS.map((em) => <button type="button" key={em} className={'emoji' + (v.icon === em ? ' on' : '')} onClick={() => setV({ ...v, icon: em })}>{em}</button>)}</div>
      </fieldset>
      <fieldset><legend>{t('color')}</legend><ColorPick value={v.color} onChange={(color) => setV({ ...v, color })} /></fieldset>
      <div className="form-actions">
        {exists && (used
          ? <button type="button" className="btn" onClick={async () => { await store.upsert('categories', [{ ...c, archived: !c.archived }]); onDone(); }}>{c.archived ? t('show') : t('hide')}</button>
          : <button type="button" className="btn danger" onClick={async () => { await store.remove('categories', [c.id]); onDone(); }}>{t('delete')}</button>)}
        <button className="btn primary grow" type="submit">{t('save')}</button>
      </div>
    </form>
  );
}
