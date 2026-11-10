import { useCallback, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, X } from 'lucide-react';
import Header from './components/Header';
import Overview from './pages/Overview';
import CreateOrder from './pages/CreateOrder';
import MyOrders from './pages/MyOrders';
import { useWallet } from './hooks/useWallet';
import { useOrders } from './hooks/useOrders';
import { saveTx } from './lib/txlog';
import { EXPLORER } from './lib/config';
import type { Page } from './types';

type Notice = { kind: 'ok' | 'err'; text: string; hashes?: string[] } | null;
function friendly(e: unknown) {
  const m = String((e as Error)?.message || e);
  const p = m.match(/panicked: ([^"\\]+)/);
  return p ? p[1].trim() : m.slice(0, 220);
}

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const w = useWallet();
  const o = useOrders(w.accountId);
  const { refreshSoon } = o;

  const run = useCallback(async (label: string, fn: () => Promise<string[]>, orderId?: number) => {
    setBusy(label); setNotice(null);
    try {
      const hashes = await fn();
      if (orderId) hashes.forEach((h) => saveTx(orderId, label, h));
      setNotice({ kind: 'ok', text: `${label}: transaction sent`, hashes });
      await refreshSoon();
      return true;
    } catch (e) { setNotice({ kind: 'err', text: friendly(e) }); return false; }
    finally { setBusy(null); }
  }, [refreshSoon]);

  return (
    <div className="min-h-screen">
      <Header page={page} setPage={setPage} account={w.accountId} onConnect={w.connect} onDisconnect={w.disconnect} />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-28">
        {page === 'overview' && <Overview account={w.accountId} orders={o.orders} total={o.total} onNav={setPage} onConnect={w.connect} />}
        {page === 'create' && <CreateOrder account={w.accountId} busy={busy} onConnect={w.connect} run={run} onDone={() => setPage('orders')} />}
        {page === 'orders' && <MyOrders account={w.accountId} orders={o.orders} loading={o.loading} error={o.error} busy={busy} run={run} onConnect={w.connect} onNav={setPage} onRefresh={o.refresh} />}
      </main>
      {(busy || notice) && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3">
          <div className="mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-line bg-card p-3 shadow-lg">
            {busy ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-near" />
              : notice?.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-near" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />}
            <div className="min-w-0 flex-1 text-sm">
              {busy ? <p>{busy}… confirm in your wallet</p> : <p className={notice?.kind === 'err' ? 'text-red-300' : ''}>{notice?.text}</p>}
              {!busy && notice?.hashes?.map((h) => (
                <a key={h} href={`${EXPLORER}/txns/${h}`} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-mute hover:text-near"><ExternalLink className="h-3 w-3" />{h.slice(0, 16)}…</a>
              ))}
            </div>
            {!busy && <button onClick={() => setNotice(null)}><X className="h-4 w-4 text-mute" /></button>}
          </div>
        </div>
      )}
    </div>
  );
}
