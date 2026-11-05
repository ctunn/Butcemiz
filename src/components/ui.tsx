import { useEffect, useState, type ReactNode } from 'react';

const ICONS = {
  home: <><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".9" fill="currentColor" /><circle cx="4" cy="12" r=".9" fill="currentColor" /><circle cx="4" cy="18" r=".9" fill="currentColor" /></>,
  import: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 11v6m-3-3 3 3 3-3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  cart: <><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  chev: <path d="m9 18 6-6-6-6" />,
};
export type IconName = keyof typeof ICONS;

/** Simple stroke icons in the SF Symbols spirit; they inherit currentColor. */
export function Icon({ name, size = 24, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {ICONS[name]}
    </svg>
  );
}

/** Tracks the iOS visual viewport so a bottom sheet sits above the on-screen keyboard. */
function useKeyboardInset(active: boolean) {
  const [vp, setVp] = useState<{ height: number; inset: number } | null>(null);
  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !v) return;
    const f = () => setVp({ height: v.height, inset: Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) });
    f();
    v.addEventListener('resize', f); v.addEventListener('scroll', f);
    return () => { v.removeEventListener('resize', f); v.removeEventListener('scroll', f); };
  }, [active]);
  return vp;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const vp = useKeyboardInset(open);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.classList.add('noscroll');
    return () => { window.removeEventListener('keydown', h); document.body.classList.remove('noscroll'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} style={vp && vp.inset > 0 ? { bottom: vp.inset } : undefined}>
      <div className={'sheet' + (vp && vp.inset > 0 ? ' kb' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={vp ? { maxHeight: Math.round(vp.height * (vp.inset > 0 ? 0.96 : 0.92)) } : undefined}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onClose} aria-label="close"><Icon name="close" size={16} stroke={2.6} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

let toastFn: ((m: string, kind?: 'ok' | 'err') => void) | null = null;
export function toast(m: string, kind: 'ok' | 'err' = 'ok') { toastFn?.(m, kind); }

export function ToastHost() {
  const [msg, setMsg] = useState<{ m: string; kind: string; id: number } | null>(null);
  useEffect(() => {
    toastFn = (m, kind = 'ok') => setMsg({ m, kind, id: Date.now() });
    return () => { toastFn = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div key={msg.id} className={'toast ' + msg.kind} role="status">{msg.m}</div> : null;
}

export function Empty({ title, hint, icon = '🪙' }: { title: string; hint?: string; icon?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p className="empty-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
    </div>
  );
}

// In-app confirmation dialog. Native confirm() is blocked in some web views and looks out of place on iOS.
type ConfirmReq = { message: string; danger: boolean; resolve: (ok: boolean) => void };
let confirmFn: ((r: ConfirmReq) => void) | null = null;

export function askConfirm(message: string, danger = true): Promise<boolean> {
  // End-to-end tests drive the native dialog instead.
  if ((window as any).__E2E_NATIVE_CONFIRM) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    if (!confirmFn) return resolve(false);
    confirmFn({ message, danger, resolve });
  });
}

export function ConfirmHost({ yes, no }: { yes: string; no: string }) {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => { confirmFn = setReq; return () => { confirmFn = null; }; }, []);
  if (!req) return null;
  const done = (ok: boolean) => { req.resolve(ok); setReq(null); };
  return (
    <div className="sheet-backdrop confirm-backdrop" onClick={() => done(false)}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-label={req.message} onClick={(e) => e.stopPropagation()}>
        <p>{req.message}</p>
        <div className="form-actions">
          <button className="btn grow" onClick={() => done(false)} autoFocus>{no}</button>
          <button className={'btn grow ' + (req.danger ? 'danger-solid' : 'primary')} onClick={() => done(true)} data-testid="confirm-ok">{yes}</button>
        </div>
      </div>
    </div>
  );
}
