import { monthLabel, shiftMonth } from '../lib/dates';
import { useStore } from '../store/store';
import { Icon } from './ui';

export function MonthNav({ month, onChange, allowAll, allLabel }: { month: string | null; onChange: (m: string | null) => void; allowAll?: boolean; allLabel?: string }) {
  const { prefs } = useStore();
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const m = month || cur;
  return (
    <div className="month-nav">
      <button className="icon-btn" aria-label="previous month" onClick={() => onChange(shiftMonth(m, -1))}><Icon name="left" size={22} stroke={2.4} /></button>
      <button className="month-label" onClick={() => allowAll && onChange(month ? null : cur)} aria-label="month">
        {month ? monthLabel(month, prefs.lang) : allLabel}
      </button>
      <button className="icon-btn" aria-label="next month" onClick={() => onChange(shiftMonth(m, 1))}><Icon name="right" size={22} stroke={2.4} /></button>
    </div>
  );
}
