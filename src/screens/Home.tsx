import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { byCategory, filterTxns, monthlyTrend, totals } from '../lib/stats';
import { PieChart } from '../components/PieChart';
import { MonthNav } from '../components/MonthNav';
import { PersonChips } from '../components/PersonChips';
import { Segmented, Empty } from '../components/ui';
import { TxnRow } from '../components/TxnRow';
import { monthLabel } from '../lib/dates';
import type { Kind, Txn } from '../types';

export function Home({ month, setMonth, onEdit }: { month: string; setMonth: (m: string) => void; onEdit: (t: Txn) => void }) {
  const { data, prefs } = useStore();
  const t = useT();
  const h = useHelpers();
  const [person, setPerson] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('expense');
  const [sel, setSel] = useState<string | null>(null);

  // Card spending always counts in the month the bill is paid (chosen by the household).
  const basis = 'pay' as const;
  const monthTx = useMemo(() => filterTxns(data.txns, { month, personId: person, basis }), [data.txns, month, person, basis]);
  const tot = totals(monthTx);
  const slices = useMemo(() => byCategory(monthTx.filter((x) => x.kind === kind), data.categories, prefs.lang), [monthTx, kind, data.categories, prefs.lang]);
  const trend = useMemo(() => monthlyTrend(filterTxns(data.txns, { personId: person }), month, 6, basis), [data.txns, person, month, basis]);
  const maxTrend = Math.max(1, ...trend.map((x) => Math.max(x.income, x.expense)));
  const selTx = sel ? monthTx.filter((x) => x.category_id === sel && x.kind === kind).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const kindTotal = kind === 'expense' ? tot.expense : tot.income;

  const byCard = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of monthTx) if (x.kind === 'expense') m.set(x.card_id || 'cash', (m.get(x.card_id || 'cash') || 0) + x.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthTx]);

  return (
    <div className="screen">
      <MonthNav month={month} onChange={(m) => { setMonth(m!); setSel(null); }} />
      <PersonChips value={person} onChange={(p) => { setPerson(p); setSel(null); }} allLabel={t('everyone')} />

      <div className="stats">
        {([['income', tot.income, 'pos'], ['expense', tot.expense, 'neg'], ['net', tot.net, tot.net >= 0 ? 'pos' : 'neg']] as const).map(([k, v, cls]) => {
          const s = h.money(v, true);
          // shrink long amounts (e.g. −₺250.000) instead of clipping them in the narrow tiles
          return (
            <div className="stat" key={k}>
              <span className="stat-label">{t(k)}</span>
              <span className={`stat-value ${cls}${s.length > 10 ? ' xs' : s.length > 8 ? ' sm' : ''}`}>{s}</span>
            </div>
          );
        })}
      </div>


      <section className="card">
        <div className="card-head">
          <h3>{t('byCategory')}</h3>
          <Segmented<Kind> value={kind} onChange={(k) => { setKind(k); setSel(null); }} options={[{ value: 'expense', label: t('expenses') }, { value: 'income', label: t('incomes') }]} />
        </div>
        {slices.length === 0 ? (
          <Empty title={t('noData')} hint={t('noDataHint')} icon={kind === 'expense' ? '🧾' : '💼'} />
        ) : (
          <>
            <div className="pie-wrap">
              <PieChart slices={slices} selected={sel} onSelect={setSel}
                center={(() => { const s = sel ? slices.find((x) => x.id === sel) : null; return s ? { label: s.label, value: h.money(s.value, true), sub: `${(s.pct * 100).toFixed(0)}%` } : { label: t('total'), value: h.money(kindTotal, true) }; })()} />
            </div>
            <ul className="legend">
              {slices.map((s) => (
                <li key={s.id}>
                  <button className={'legend-row' + (sel === s.id ? ' on' : '')} onClick={() => setSel(sel === s.id ? null : s.id)}>
                    <span className="swatch" style={{ background: s.color }} />
                    <span className="legend-icon">{s.icon}</span>
                    <span className="legend-name">{s.label}</span>
                    <span className="legend-pct">{(s.pct * 100).toFixed(0)}%</span>
                    <span className="legend-amt">{h.money(s.value, true)}</span>
                  </button>
                  {sel === s.id && (
                    <div className="legend-detail">
                      {selTx.map((x) => <TxnRow key={x.id} t={x} onClick={() => onEdit(x)} />)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {kind === 'expense' && byCard.length > 0 && (
        <section className="card">
          <h3>{t('paidWith')}</h3>
          <ul className="bars">
            {byCard.map(([id, v]) => (
              <li key={id}>
                <span className="bar-label">{id === 'cash' ? t('cash') : (h.card(id)?.name || '?') + (h.person(h.card(id)?.person_id ?? null) ? ' · ' + h.person(h.card(id)!.person_id)!.name : '')}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / tot.expense) * 100}%` }} /></span>
                <span className="bar-amt">{h.money(v, true)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>{t('last6')}</h3>
        <div className="trend" role="img" aria-label={t('last6')}>
          {trend.map((m) => (
            <button key={m.month} className={'trend-col' + (m.month === month ? ' on' : '')} onClick={() => setMonth(m.month)} aria-label={monthLabel(m.month, prefs.lang)}>
              <span className="trend-bars">
                <span className="tb inc" style={{ height: `${(m.income / maxTrend) * 100}%` }} />
                <span className="tb exp" style={{ height: `${(m.expense / maxTrend) * 100}%` }} />
              </span>
              <span className="trend-lbl">{monthLabel(m.month, prefs.lang).slice(0, 3)}</span>
            </button>
          ))}
        </div>
        <div className="trend-key"><span><i className="tb inc" />{t('income')}</span><span><i className="tb exp" />{t('expense')}</span></div>
      </section>
    </div>
  );
}
