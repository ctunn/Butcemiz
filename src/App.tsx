import { useEffect, useState } from 'react';
import { store, useStore } from './store/store';
import { useT } from './i18n';
import { Home } from './screens/Home';
import { Transactions } from './screens/Transactions';
import { Import } from './screens/Import';
import { Settings } from './screens/Settings';
import { TxnForm } from './screens/TxnForm';
import { resumeSync } from './screens/Sync';
import { Icon, Sheet, ToastHost, ConfirmHost, type IconName } from './components/ui';
import { todayISO } from './lib/dates';
import type { Txn } from './types';

type Tab = 'home' | 'txns' | 'import' | 'settings';

export function App() {
  const t = useT();
  const { error, prefs, syncing } = useStore();
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'home');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);

  useEffect(() => { resumeSync(); }, []);
  useEffect(() => { document.documentElement.lang = prefs.lang; document.title = t('appName'); }, [prefs.lang]); // eslint-disable-line
  useEffect(() => { history.replaceState(null, '', '#' + tab); window.scrollTo(0, 0); }, [tab]);

  const tabs: { id: Tab | 'add'; icon: IconName; label: string }[] = [
    { id: 'home', icon: 'home', label: t('home') },
    { id: 'txns', icon: 'list', label: t('txns') },
    { id: 'add', icon: 'plus', label: t('add') },
    { id: 'import', icon: 'import', label: t('import') },
    { id: 'settings', icon: 'settings', label: t('settings') },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <h1>{t(tab === 'home' ? 'appName' : tab === 'txns' ? 'txns' : tab === 'import' ? 'import' : 'settings')}</h1>
        {syncing && <span className="spinner" aria-label="syncing" />}
      </header>
      {error && (
        <div className="banner err" role="alert">
          <span>{t('error')}: {error}</span>
          <button className="link" onClick={() => store.clearError()} aria-label={t('close')}><Icon name="close" size={18} /></button>
        </div>
      )}
      <main>
        {tab === 'home' && <Home month={month} setMonth={setMonth} onEdit={setEditing} />}
        {tab === 'txns' && <Transactions month={month} setMonth={setMonth} onEdit={setEditing} />}
        {tab === 'import' && <Import />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="tabbar">
        {tabs.map((x) => x.id === 'add' ? (
          <button key="add" className="tab add" onClick={() => setAdding(true)} aria-label={t('addExpense')}><span className="add-circle"><Icon name="plus" size={28} stroke={2.4} /></span></button>
        ) : (
          <button key={x.id} className={'tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id as Tab)} aria-current={tab === x.id ? 'page' : undefined}>
            <span className="tab-icon"><Icon name={x.icon} size={25} stroke={tab === x.id ? 2.2 : 1.8} /></span><span className="tab-label">{x.label}</span>
          </button>
        ))}
      </nav>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('addExpense')}>
        <TxnForm onDone={() => setAdding(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('editTxn')}>
        {editing && <TxnForm initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <ToastHost />
      <ConfirmHost yes={t('confirmYes')} no={t('cancel')} />
    </div>
  );
}
