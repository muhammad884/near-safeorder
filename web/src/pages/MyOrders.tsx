import { Inbox, Loader2, RefreshCw } from 'lucide-react';
import OrderCard from '../components/OrderCard';
import { useT } from '../lib/i18n';
import type { Order, Page, RunFn } from '../types';

type P = { account: string | null; orders: Order[]; loading: boolean; error: string | null; busy: string | null; run: RunFn; onConnect: () => void; onNav: (p: Page) => void; onRefresh: () => void };

export default function MyOrders({ account, orders, loading, error, busy, run, onConnect, onNav, onRefresh }: P) {
  const { t } = useT();
  const btn = 'mt-4 rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear';
  if (!account) return (
    <div className="rounded-2xl border border-line bg-card p-6 text-center">
      <p className="text-mute">{t('mo.connect')}</p>
      <button onClick={onConnect} className={btn}>{t('connect')}</button>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('mo.title')}</h1>
        <button onClick={onRefresh} className="flex items-center gap-1 text-sm text-mute hover:text-near"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('refresh')}</button>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{t('mo.err', { e: error })}</p>}
      {loading && orders.length === 0 && <p className="flex items-center gap-2 text-mute"><Loader2 className="h-4 w-4 animate-spin" />{t('mo.loading')}</p>}
      {!loading && !error && orders.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-mute" />
          <p className="mt-2 text-mute">{t('mo.empty')}</p>
          <button onClick={() => onNav('create')} className={btn}>{t('mo.first')}</button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {orders.map((o) => <OrderCard key={o.id} order={o} me={account} busy={busy} run={run} />)}
      </div>
    </div>
  );
}
