import { useStore } from '../store/store';
import { useT } from '../i18n';
import { HOME_GROUP } from '../lib/defaults';

export function PersonChips({ value, onChange, allLabel }: { value: string | null; onChange: (v: string | null) => void; allLabel: string }) {
  const { data } = useStore();
  const t = useT();
  return (
    <div className="chips" role="group">
      <button className={'chip' + (value === null ? ' on' : '')} onClick={() => onChange(null)}>{allLabel}</button>
      {data.people.map((p) => (
        <button key={p.id} className={'chip' + (value === p.id ? ' on' : '')} onClick={() => onChange(p.id)}>
          <span className="dot" style={{ background: p.color }} />{p.name}
        </button>
      ))}
      <button className={'chip chip-home' + (value === HOME_GROUP ? ' on' : '')} onClick={() => onChange(HOME_GROUP)}>🏠 {t('homeGroup')}</button>
    </div>
  );
}
