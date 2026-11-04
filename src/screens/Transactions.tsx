import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useT } from '../i18n';
import { useHelpers } from '../hooks';
import { MonthNav } from '../components/MonthNav';
import { PersonChips } from '../components/PersonChips';
import { TxnRow } from '../components/TxnRow';
import { Empty } from '../components/ui';
import { dayLabel, todayISO } from '../lib/dates';
import { fold } from '../lib/text';
import { totals } from '../lib/stats';
import type { Txn } from '../types';

export function Transactions({ month, setMonth, onEdit }: { month: string; setMonth: (m: string) => void; onEdit: (t: Txn) => void }) {
  const { data, prefs } = useStore();
  const t = useT();
  const h = useHelpers();
  const [allMonths, setAllMonths] = useState(false);
  const [q, setQ] = useState('');
  const [person, setPerson] = useState<string | null>(null);
  const [card, setCard] = useState<string>('');

  const list = useMemo(() => {
    const fq = fold(q.trim());
    return data.txns
      .filter((x) => (allMonths || x.date.startsWith(month)) && (!person || x.person_id === person) &&
        (!card || (card === 'cash' ? !x.card_id : x.card_id === card)) &&
        (!fq || fold(x.note + ' ' + h.catName(h.cat(x.category_id)) + ' ' + String(x.amount) + ' ' + h.money(x.amount)).includes(fq)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }, [data.txns, month, allMonths, q, person, card, h]);

  const groups = useMemo(() => {
    const g: { date: string; items: Txn[] }[] = [];
    for (const x of list) {
      const last = g[g.length - 1];
      if (last && last.date === x.date) last.items.push(x); else g.push({ date: x.date, items: [x] });
    }
    return g;
  }, [list]);

  const tot = totals(list);
  const today = todayISO();
  const yest = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  return (
    <div className="screen">
      <MonthNav month={allMonths ? null : month} allowAll allLabel={t('allMonths')} onChange={(m) => { if (m) { setMonth(m); setAllMonths(false); } else setAllMonths(true); }} />
      <div className="filters">
        <input className="search" type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
        <select value={card} onChange={(e) => setCard(e.target.value)} aria-label={t('paidWith')}>
          <option value="">{t('allCards')}</option>
          <option value="cash">{t('cash')}</option>
          {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}{h.person(c.person_id) ? ` · ${h.person(c.person_id)!.name}` : ''}</option>)}
        </select>
      </div>
      <PersonChips value={person} onChange={setPerson} allLabel={t('everyone')} />
      {list.length > 0 && (
        <div className="list-total">
          <span>{list.length} · <b className="pos">+{h.money(tot.income, true)}</b> · <b className="neg">−{h.money(tot.expense, true)}</b></span>
        </div>
      )}
      {groups.length === 0 ? <Empty title={t('noData')} hint={t('noDataHint')} /> : groups.map((g) => (
        <section key={g.date} className="day">
          <h4 className="day-head">
            <span>{g.date === today ? t('today') : g.date === yest ? t('yesterday') : dayLabel(g.date, prefs.lang)}</span>
            <span>{h.money(g.items.reduce((a, x) => a + (x.kind === 'expense' ? -x.amount : x.amount), 0))}</span>
          </h4>
          <div className="card list">{g.items.map((x) => <TxnRow key={x.id} t={x} onClick={() => onEdit(x)} />)}</div>
        </section>
      ))}
    </div>
  );
}
