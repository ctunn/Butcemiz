import type { Txn } from '../types';
import { useHelpers } from '../hooks';

export function TxnRow({ t, onClick }: { t: Txn; onClick?: () => void }) {
  const h = useHelpers();
  const c = h.cat(t.category_id);
  const card = h.card(t.card_id);
  const p = h.person(t.person_id);
  const sub = [p?.name, card?.name].filter(Boolean).join(' · ');
  return (
    <button className="txn" onClick={onClick}>
      <span className="txn-icon" style={{ background: (c?.color || '#999') + '26' }}>{c?.icon || '❔'}</span>
      <span className="txn-main">
        <span className="txn-title">{t.note || h.catName(c)}</span>
        <span className="txn-sub">{t.note ? h.catName(c) + (sub ? ' · ' + sub : '') : sub}</span>
      </span>
      <span className={'txn-amt ' + t.kind}>{t.kind === 'income' ? '+' : '−'}{h.money(t.amount)}</span>
    </button>
  );
}
