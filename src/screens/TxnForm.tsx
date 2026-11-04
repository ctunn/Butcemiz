import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { Segmented, toast, askConfirm } from '../components/ui';
import { parseAmount } from '../lib/money';
import { todayISO } from '../lib/dates';
import { uid } from '../lib/id';
import { payMonthFor } from '../lib/paymonth';
import { merchantKey } from '../lib/text';
import type { Kind, Txn } from '../types';

export function TxnForm({ initial, initialKind = 'expense', onDone }: { initial?: Txn | null; initialKind?: Kind; onDone: () => void }) {
  const { data, prefs } = useStore();
  const t = useT();
  const h = useHelpers();
  const [kind, setKind] = useState<Kind>(initial?.kind || initialKind);
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', prefs.lang === 'tr' ? ',' : '.') : '');
  const [cat, setCat] = useState<string>(initial?.category_id || '');
  const [date, setDate] = useState(initial?.date || todayISO());
  const [person, setPerson] = useState<string | null>(initial ? initial.person_id : prefs.defaultPersonId && data.people.some((p) => p.id === prefs.defaultPersonId) ? prefs.defaultPersonId : data.people[0]?.id ?? null);
  const [card, setCard] = useState<string>(initial?.card_id || '');
  const [note, setNote] = useState(initial?.note || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const amtRef = useRef<HTMLInputElement>(null);

  // Focus synchronously while still inside the "+" tap so iOS Safari opens the keyboard.
  useLayoutEffect(() => { if (!initial) amtRef.current?.focus({ preventScroll: true }); }, [initial]);

  const cats = data.categories.filter((c) => c.kind === kind && (!c.archived || c.id === cat));
  useEffect(() => { if (cat && !cats.some((c) => c.id === cat)) setCat(''); }, [kind]); // eslint-disable-line

  const save = async () => {
    const n = parseAmount(amount);
    if (n === null || n <= 0) { setErr(t('invalidAmount')); amtRef.current?.focus(); return; }
    const category = cat || (kind === 'expense' ? 'other' : 'other_income');
    const row: Txn = {
      id: initial?.id || uid(),
      kind, amount: Math.round(n * 100) / 100, date, category_id: category,
      person_id: person, card_id: kind === 'expense' && card ? card : null,
      // keep the statement's payment month for imported rows; otherwise derive it from the card's days
      pay_month: initial?.source === 'import' && initial.card_id === (card || null) && initial.pay_month
        ? initial.pay_month
        : kind === 'expense' && card ? payMonthFor(date, data.cards.find((c) => c.id === card)) : null,
      note: note.trim(), source: initial?.source || 'manual', import_id: initial?.import_id ?? null,
      created_at: initial?.created_at || new Date().toISOString(),
    };
    setBusy(true);
    try {
      await store.upsert('txns', [row]);
      // Re-categorising an imported item teaches the importer for next time.
      if (initial?.source === 'import' && initial.category_id !== category && initial.note) {
        const key = merchantKey(initial.note);
        if (key) {
          const existing = data.rules.find((r) => r.key === key);
          await store.upsert('rules', [{ id: existing?.id || uid(), key, category_id: category }]);
        }
      }
      if (person) store.setPrefs({ defaultPersonId: person });
      toast(t('saved'));
      onDone();
    } catch (e: any) {
      toast(t('error') + ': ' + (e?.message || e), 'err');
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!initial || !(await askConfirm(t('confirmDelete')))) return;
    try { await store.remove('txns', [initial.id]); toast(t('deleted')); onDone(); }
    catch (e: any) { toast(t('error') + ': ' + (e?.message || e), 'err'); }
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Segmented<Kind> value={kind} onChange={setKind} options={[{ value: 'expense', label: t('expense') }, { value: 'income', label: t('income') }]} />
      <label className="amount-field">
        <span className="sr">{t('amount')}</span>
        <input ref={amtRef} autoFocus={!initial} autoComplete="off" className={'amount-input ' + kind} style={{ width: `calc(${Math.max(1, amount.length)}ch + 12px)` }} inputMode="decimal" enterKeyHint="done" placeholder="0" value={amount} aria-label={t('amount')}
          onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, '')); setErr(''); }} />
        <span className="amount-cur">{prefs.currency === 'TRY' ? '₺' : prefs.currency}</span>
      </label>
      {err && <p className="field-err" role="alert">{err}</p>}

      <fieldset>
        <legend>{t('category')}</legend>
        <div className="cat-grid">
          {cats.map((c) => (
            <button type="button" key={c.id} className={'cat-btn' + (cat === c.id ? ' on' : '')} style={{ '--c': c.color } as any} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}>
              <span className="cat-emoji">{c.icon}</span>
              <span className="cat-name">{h.catName(c)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="row2">
        <label className="field"><span>{t('date')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} /></label>
        {kind === 'expense' && (
          <label className="field"><span>{t('paidWith')}</span>
            <select value={card} onChange={(e) => setCard(e.target.value)}>
              <option value="">{t('cash')}</option>
              {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}{h.person(c.person_id) ? ` · ${h.person(c.person_id)!.name}` : ''}</option>)}
            </select>
          </label>
        )}
      </div>

      {data.people.length > 0 && (
        <fieldset>
          <legend>{t('person')}</legend>
          <div className="chips">
            {data.people.map((p) => (
              <button type="button" key={p.id} className={'chip' + (person === p.id ? ' on' : '')} onClick={() => setPerson(p.id)} aria-pressed={person === p.id}>
                <span className="dot" style={{ background: p.color }} />{p.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="field"><span>{t('note')}</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></label>

      <div className="form-actions">
        {initial && <button type="button" className="btn danger" onClick={del}>{t('delete')}</button>}
        <button type="submit" className="btn primary grow" disabled={busy}>{t('save')}</button>
      </div>
    </form>
  );
}
