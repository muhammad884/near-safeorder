import { useState } from 'react';
import { ShieldCheck, LogOut, Wallet, Sun, Moon } from 'lucide-react';
import { setLang, useT } from '../lib/i18n';
import type { Page } from '../types';

const tabs: { id: Page; k: string }[] = [
  { id: 'overview', k: 'nav.overview' }, { id: 'create', k: 'nav.create' }, { id: 'orders', k: 'nav.orders' },
];
type P = { page: Page; setPage: (p: Page) => void; account: string | null; onConnect: () => void; onDisconnect: () => void };

export default function Header({ page, setPage, account, onConnect, onDisconnect }: P) {
  const { t, lang } = useT();
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('so-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  const btn = 'rounded-lg border border-line bg-card p-2 text-xs font-semibold text-mute hover:text-near';
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-near" />
          <span className="text-lg font-semibold">NEAR <span className="text-near">SafeOrder</span></span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLang(lang === 'en' ? 'ha' : 'en')} className={btn} aria-label="Language">{lang === 'en' ? 'HA' : 'EN'}</button>
          <button onClick={toggle} aria-label="Toggle light and dark mode" className={btn}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          {account ? (
            <button onClick={onDisconnect} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
              <span className="max-w-[90px] truncate">{account}</span><LogOut className="h-4 w-4 text-mute" />
            </button>
          ) : (
            <button onClick={onConnect} className="flex items-center gap-2 rounded-lg bg-near px-3 py-2 text-sm font-semibold text-onnear">
              <Wallet className="h-4 w-4" />{t('connect')}
            </button>
          )}
        </div>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setPage(x.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${page === x.id ? 'bg-card text-near' : 'text-mute hover:text-ink'}`}>
            {t(x.k)}
          </button>
        ))}
      </nav>
    </header>
  );
}
