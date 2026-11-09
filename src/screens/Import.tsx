import { useMemo, useRef, useState } from 'react';
import { store, useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { toast, Empty, askConfirm } from '../components/ui';
import { isImage, parseScreenshots, parseStatementFile } from '../import/importFile';
import { payMonthFor } from '../lib/paymonth';
import { todayISO } from '../lib/dates';
import { PdfPasswordError } from '../import/errors';
import { suggestCategory } from '../lib/categorize';
import { merchantKey } from '../lib/text';
import { uid } from '../lib/id';
import type { BankId, Kind, Txn } from '../types';
import type { RowFlag } from '../import/parse';
import { BANK_NAMES } from '../lib/banks';
import { buildImport, findProvisional, isInstallmentDuplicate, isRecurringKey, parseInst, planUndo, syncPlan } from '../lib/installments';
import { HOME_CATS } from '../lib/defaults';

interface Row { key: string; date: string; description: string; amount: number; kind: Kind; category: string; include: boolean; flag: RowFlag; dup: boolean; installment?: string | null; suggested: string; prov?: boolean }

export function Import() {
  const { data } = useStore();
  const t = useT();
  const h = useHelpers();
  const [cardId, setCardId] = useState<string>(data.cards[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [shots, setShots] = useState<File[] | null>(null); // bank-app screenshots (provisional rows)
  const [needPw, setNeedPw] = useState<'' | 'need' | 'wrong'>('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<BankId | null>(null);
  const [mode, setMode] = useState<'card' | 'account'>('card');
  const [skipped, setSkipped] = useState(0);
  const [stmtDates, setStmtDates] = useState<{ cut: string | null; due: string | null }>({ cut: null, due: null });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [raw, setRaw] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const catsFor = (k: Kind) => data.categories.filter((c) => c.kind === k && !c.archived);

  const run = async (f: File, password?: string, images?: File[] | null) => {
    setBusy(true); setFailed(false); setRows(null); setRaw('');
    try {
      const res = images ? await parseScreenshots(images, todayISO()) : await parseStatementFile(f, password);
      setNeedPw(''); setBank(res.bank); setMode(res.mode); setSkipped(res.skipped); setStmtDates({ cut: res.cutDate ?? null, due: res.dueDate ?? null });
      // pick a card/account of the detected bank and statement type if the selected one doesn't match
      const sel = data.cards.find((c) => c.id === cardId);
      let useCard = cardId;
      const wantKind = res.mode === 'account' ? 'account' : 'card';
      if (res.bank !== 'other' && (sel?.bank !== res.bank || (sel?.kind || 'card') !== wantKind)) {
        const match = data.cards.find((c) => c.bank === res.bank && (c.kind || 'card') === wantKind) || data.cards.find((c) => c.bank === res.bank);
        if (match) { useCard = match.id; setCardId(match.id); }
      }
      // a statement replaces screenshot rows instead of calling them duplicates
      const cardTxns = data.txns.filter((x) => x.card_id === useCard && (images || x.source !== 'screenshot'));
      const provTaken = new Set<string>();
      const provOf = (r: { date: string; amount: number; kind: Kind }) => {
        if (images) return false;
        const p = findProvisional(data.txns, provTaken, useCard || null, r);
        if (p) provTaken.add(p.id);
        return !!p;
      };
      // planned installments are not real yet, so they never count as "already imported"
      const existing = new Set(cardTxns.filter((x) => !x.projected && (!x.plan_key || isRecurringKey(x.plan_key))).map((x) => `${x.date}|${x.amount}|${x.kind}`));
      const catIds = new Set(data.categories.map((c) => c.id));
      const out: Row[] = res.rows.map((r, i) => {
        let sug: string;
        if (r.kind === 'income') sug = r.hint === 'salary' ? 'salary' : 'other_income';
        else sug = (r.hint && catIds.has(r.hint) ? r.hint : null) || suggestCategory(r.description, data.rules) || 'other';
        if (!catIds.has(sug)) sug = r.kind === 'income' ? 'other_income' : 'other';
        // installments: the same purchase shows up every month with the same date and amount, so match on the installment number
        const dup = parseInst(r.installment) && r.kind === 'expense'
          // (rows saved before installment plans existed have no plan, so also compare date + amount)
          ? isInstallmentDuplicate({ ...r, category: '' }, useCard || null, cardTxns, res.mode === 'card' && res.dueDate ? res.dueDate.slice(0, 7) : null) || existing.has(`${r.date}|${r.amount}|${r.kind}`)
          : existing.has(`${r.date}|${r.amount}|${r.kind}`);
        // transfers that clearly pay for something (e.g. "AİDAT") are kept
        const keepTransfer = r.flag === 'transfer' && r.kind === 'expense' && !!suggestCategory(r.description, data.rules);
        const include = !dup && (!r.flag || keepTransfer);
        return { key: String(i), date: r.date, description: r.description, amount: r.amount, kind: r.kind, category: sug, suggested: sug, include, flag: keepTransfer ? null : r.flag, dup, installment: r.installment, prov: !dup && provOf(r) };
      });
      setRows(out);
      if (!out.length) { setFailed(true); setRaw(res.raw ?? ''); }
    } catch (e) {
      if (e instanceof PdfPasswordError) { setNeedPw(e.wrong ? 'wrong' : 'need'); }
      else { console.error(e); setFailed(true); toast(t('error') + ': ' + ((e as any)?.message || e), 'err'); }
    } finally { setBusy(false); }
  };

  const onPick = (list: FileList | null | undefined) => {
    const files = list ? [...list] : [];
    if (!files.length) return;
    const images = files.filter(isImage);
    const f = files[0];
    setFile(f); setPw(''); setNeedPw('');
    setShots(images.length ? images : null);
    run(f, undefined, images.length ? images : null);
  };

  const selected = rows?.filter((r) => r.include) || [];
  const selTotal = selected.reduce((a, r) => a + (r.kind === 'expense' ? r.amount : -r.amount), 0);

  const doImport = async () => {
    if (!rows || !selected.length) return;
    const card = data.cards.find((c) => c.id === cardId);
    const importId = uid();
    const now = new Date().toISOString();
    // Card statements are paid in the month of their due date: that is the budget month.
    const isCard = (card?.kind || 'card') === 'card';
    const payMonth = isCard && mode === 'card' && stmtDates.due ? stmtDates.due.slice(0, 7) : null;
    // cash/bank plans (loan) can be paid from an account statement, so they are candidates too
    const pool = data.txns.filter((x) => x.card_id === (cardId || null) || (!x.card_id && isRecurringKey(x.plan_key)));
    const removed: string[] = [];
    const txns: Txn[] = buildImport(selected, pool, {
      cardId: cardId || null, personId: card?.person_id ?? null, payMonth: isCard ? payMonth : null, importId, now, uid,
      source: shots ? 'screenshot' : 'import', payMonthOf: shots ? (d) => payMonthFor(d, card) : undefined, removed,
    }).map((x) => {
      // home categories start as Ev expenses, unless this purchase already has a choice from an earlier month
      const known = x.plan_key && data.txns.some((y) => y.plan_key === x.plan_key);
      return HOME_CATS.has(x.category_id) && !x.shared && !known ? { ...x, shared: true } : x;
    });
    // learn categories the user corrected
    const learned = new Map<string, string>();
    for (const r of selected) if (r.kind === 'expense' && r.category !== r.suggested) { const k = merchantKey(r.description); if (k) learned.set(k, r.category); }
    setBusy(true);
    try {
      await store.upsert('txns', [...txns, ...syncPlan(txns.filter((x) => !x.projected), data.txns)]);
      if (removed.length) await store.remove('txns', removed);
      const replaced = txns.filter((x) => data.txns.some((y) => y.id === x.id && y.source === 'screenshot')).length;
      // screenshot rows from this statement's period that the statement does not have (cancelled, refunded…)
      if (!shots && isCard && stmtDates.cut) {
        const got = new Set([...txns.map((x) => x.id), ...removed]);
        const left = data.txns.filter((x) => x.source === 'screenshot' && x.card_id === (cardId || null) && !x.projected && x.date <= stmtDates.cut! && !got.has(x.id));
        if (left.length) {
          const list = left.slice(0, 8).map((x) => `• ${x.date.slice(8, 10)}.${x.date.slice(5, 7)} ${(x.note || '').slice(0, 26)} ${h.money(x.amount)}`).join('\n');
          if (await askConfirm(t('provLeft', { n: left.length }) + '\n\n' + list)) {
            const plans = new Set(left.map((x) => x.plan_key).filter(Boolean));
            await store.remove('txns', [...left.map((x) => x.id), ...data.txns.filter((x) => x.projected && plans.has(x.plan_key)).map((x) => x.id)]);
          }
        }
      }
      // Remember the card's cut-off and due days so manual card entries land in the right month.
      if (card && isCard && stmtDates.cut && stmtDates.due) {
        const cut_day = Number(stmtDates.cut.slice(8, 10)), due_day = Number(stmtDates.due.slice(8, 10));
        if (card.cut_day !== cut_day || card.due_day !== due_day) await store.upsert('cards', [{ ...card, cut_day, due_day }]);
      }
      if (learned.size) {
        await store.upsert('rules', [...learned].map(([key, category_id]) => ({ id: data.rules.find((x) => x.key === key)?.id || uid(), key, category_id })));
      }
      const planned = txns.filter((x) => x.projected).length;
      toast(t('imported', { n: txns.length - planned }) + (planned ? ' · ' + t('plannedAdded', { n: planned }) : '') + (replaced ? ' · ' + t('provReplaced', { n: replaced }) : '')
        + (shots && isCard && card && (!card.cut_day || !card.due_day) ? ' · ' + t('noCardDays') : ''));
      setRows(null); setFile(null); setShots(null); if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) { toast(t('error') + ': ' + (e?.message || e), 'err'); }
    finally { setBusy(false); }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const imports = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const x of data.txns) if (x.import_id) { const l = m.get(x.import_id) || []; l.push(x); m.set(x.import_id, l); }
    return [...m.entries()].filter(([, l]) => l.some((x) => !x.projected)).map(([id, l]) => {
      const real = l.filter((x) => !x.projected);
      return { id, txns: l, count: real.length, at: real[0].created_at, card: real[0].card_id, from: real.reduce((a, x) => (x.date < a ? x.date : a), real[0].date), to: real.reduce((a, x) => (x.date > a ? x.date : a), real[0].date), total: real.reduce((a, x) => a + x.amount, 0) };
    })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [data.txns]);

  const undo = async (id: string, importTxns: Txn[]) => {
    if (!(await askConfirm(t('confirmUndo')))) return;
    const { remove, restore } = planUndo(importTxns, data.txns, id);
    try {
      if (restore.length) await store.upsert('txns', restore);
      await store.remove('txns', remove);
      toast(t('deleted'));
    } catch (e: any) { toast(t('error') + ': ' + (e?.message || e), 'err'); }
  };

  return (
    <div className="screen">
      <section className="card">
        <h3>{t('importTitle')}</h3>
        <p className="muted small">{t('importHint')}</p>
        <label className="field"><span>{t('cardOrAccount')}</span>
          <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}{h.person(c.person_id) ? ` · ${h.person(c.person_id)!.name}` : ''}</option>)}
          </select>
        </label>
        <input ref={fileRef} type="file" multiple accept=".pdf,.csv,.txt,application/pdf,text/csv,image/*" className="sr" id="stmt-file" onChange={(e) => onPick(e.target.files)} data-testid="file-input" />
        <label htmlFor="stmt-file" className="btn primary block">{busy ? t('reading') : '📄 ' + t('chooseFile')}</label>
        {file && <p className="muted small center">{file.name}</p>}

        {needPw && (
          <form className="pw" onSubmit={(e) => { e.preventDefault(); file && run(file, pw); }}>
            <p className="small">{needPw === 'wrong' ? t('wrongPassword') : t('pdfPassword')}</p>
            <div className="row2">
              <input type="password" inputMode="numeric" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="password" autoFocus />
              <button className="btn primary" type="submit">{t('unlock')}</button>
            </div>
          </form>
        )}
        {failed && <p className="field-err">{shots ? t('noRowsShot') : t('noRows')}</p>}
        {failed && shots && (
          <details className="ocr-raw">
            <summary>{t('ocrText')}</summary>
            <pre>{raw || '—'}</pre>
          </details>
        )}
      </section>

      {rows && rows.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>{t('found', { n: rows.length })}</h3>
            {bank && <span className="badge">{BANK_NAMES[bank]} · {t(mode === 'account' ? 'modeAccount' : 'modeCard')}</span>}
          </div>
          {skipped > 0 && <p className="muted small">{t('skippedRows', { n: skipped })}</p>}
          {rows.some((r) => r.flag) && <p className="muted small">{t('unticked', { n: rows.filter((r) => r.flag).length })}</p>}
          {rows.some((r) => r.dup) && <p className="muted small">{t('duplicates', { n: rows.filter((r) => r.dup).length })}</p>}
          <div className="row-actions">
            <button className="link" onClick={() => setRows(rows.map((r) => ({ ...r, include: true })))}>{t('selectAll')}</button>
            <button className="link" onClick={() => setRows(rows.map((r) => ({ ...r, include: false })))}>{t('selectNone')}</button>
          </div>
          <ul className="preview">
            {rows.map((r) => (
              <li key={r.key} className={r.include ? '' : 'off'}>
                <label className="pv-check"><input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={r.description} /></label>
                <div className="pv-main">
                  <div className="pv-top"><span className="pv-desc">{r.description}</span><span className={'pv-amt' + (r.kind === 'income' ? ' pos' : '')}>{r.kind === 'income' ? '+' : '−'}{h.money(r.amount)}</span></div>
                  <div className="pv-bottom">
                    <span className="pv-date">{r.date.split('-').reverse().join('.')}{r.installment ? ` · ${t('installment')} ${r.installment}` : ''}{r.flag ? ` · ${t(('flag_' + r.flag) as any)}` : ''}{r.dup ? ` · ${t('duplicate')}` : ''}{r.prov ? ` · ${t('provMatch')}` : ''}</span>
                    <select value={r.category} onChange={(e) => update(r.key, { category: e.target.value, include: true })} aria-label={t('category')}>
                      {catsFor(r.kind).map((c) => <option key={c.id} value={c.id}>{c.icon} {h.catName(c)}</option>)}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button className="btn primary block sticky-cta" disabled={!selected.length || busy} onClick={doImport}>
            {t('importN', { n: selected.length })} · {h.money(selTotal)}
          </button>
        </section>
      )}

      <section className="card">
        <h3>{t('pastImports')}</h3>
        {imports.length === 0 ? <Empty title={t('noData')} icon="📂" /> : (
          <ul className="imports">
            {imports.map((im) => (
              <li key={im.id}>
                <div>
                  <b>{h.card(im.card)?.name || '—'}</b>{h.person(h.card(im.card)?.person_id ?? null) ? ' · ' + h.person(h.card(im.card)!.person_id)!.name : ''}
                  <div className="muted small">{im.from.split('-').reverse().join('.')} – {im.to.split('-').reverse().join('.')} · {im.count} · {h.money(im.total, true)}</div>
                </div>
                <button className="link danger" onClick={() => undo(im.id, im.txns)}>{t('undoImport')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
