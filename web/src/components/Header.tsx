import { ShieldCheck, LogOut, Wallet } from 'lucide-react';
import type { Page } from '../types';

const tabs: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'create', label: 'Create Order' }, { id: 'orders', label: 'My Orders' },
];
type P = { page: Page; setPage: (p: Page) => void; account: string | null; onConnect: () => void; onDisconnect: () => void };

export default function Header({ page, setPage, account, onConnect, onDisconnect }: P) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-near" />
          <span className="text-lg font-semibold">NEAR <span className="text-near">SafeOrder</span></span>
        </div>
        {account ? (
          <button onClick={onDisconnect} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
            <span className="max-w-[150px] truncate">{account}</span><LogOut className="h-4 w-4 text-mute" />
          </button>
        ) : (
          <button onClick={onConnect} className="flex items-center gap-2 rounded-lg bg-near px-3 py-2 text-sm font-semibold text-bg">
            <Wallet className="h-4 w-4" />Connect wallet
          </button>
        )}
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setPage(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${page === t.id ? 'bg-card text-near' : 'text-mute hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
