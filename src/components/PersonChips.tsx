import { useStore } from '../store/store';

export function PersonChips({ value, onChange, allLabel }: { value: string | null; onChange: (v: string | null) => void; allLabel: string }) {
  const { data } = useStore();
  if (data.people.length < 2) return null;
  return (
    <div className="chips" role="group">
      <button className={'chip' + (value === null ? ' on' : '')} onClick={() => onChange(null)}>{allLabel}</button>
      {data.people.map((p) => (
        <button key={p.id} className={'chip' + (value === p.id ? ' on' : '')} onClick={() => onChange(p.id)}>
          <span className="dot" style={{ background: p.color }} />{p.name}
        </button>
      ))}
    </div>
  );
}
