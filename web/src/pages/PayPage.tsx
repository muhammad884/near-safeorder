import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { DECIMALS, SYMBOL, fetchOrder, fromUnits, payNear, payUsdc } from '../lib/near';
import { useT } from '../lib/i18n';
import type { Order, Page, RunFn } from '../types';

type P = { orderId: number; account: string | null; busy: string | null; run: RunFn; onConnect: () => void; onNav: (p: Page) => void };

export default function PayPage({ orderId, account, busy, run, onConnect, onNav }: P) {
  const { t } = useT();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const r = await fetchOrder(orderId); if (alive) { setO(r); setErr(null); } }
      catch (e) { if (alive) setErr(String((e as Error).message || e)); }
    };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [orderId]);

  if (err) return <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{t('pp.err', { e: err })}</p>;
  if (o === undefined) return <p className="flex items-center gap-2 text-mute"><Loader2 className="h-4 w-4 animate-spin" />{t('pp.load')}</p>;
  if (o === null) return <p className="rounded-2xl border border-line bg-card p-6 text-mute">{t('pp.nf', { id: orderId })}</p>;

  const dec = DECIMALS[o.token], sym = SYMBOL[o.token], amt = fromUnits(o.amount, dec);
  const mine = !!account && account === o.buyer;
  const btn = 'rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear disabled:opacity-50';
  let body: React.ReactNode;
  if (o.status !== 'Created') {
    body = mine
      ? <div><p className="text-sm text-mute">{t('pp.mine')}</p><button onClick={() => onNav('orders')} className={`mt-3 ${btn}`}>{t('cr.goOrders')}</button></div>
      : <p className="text-sm text-mute">{t('pp.done', { s: t('status.' + o.status).toLowerCase() })}</p>;
  } else if (!account) {
    body = <button onClick={onConnect} className={btn}>{t('pp.connectPay')}</button>;
  } else if (account === o.seller) {
    body = <p className="text-sm text-mute">{t('pp.own')}</p>;
  } else if (o.buyer && o.buyer !== account) {
    body = <p className="text-sm text-red-600 dark:text-red-300">{t('pp.reserved', { b: o.buyer, a: account })}</p>;
  } else {
    body = <button disabled={!!busy} onClick={() => run('Pay', () => (o.token === 'Near' ? payNear(o) : payUsdc(o, account)), o.id)} className={btn}>{t('pp.pay', { amt, sym })}</button>;
  }
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs text-mute">{t('pp.req', { id: o.id })}</p><p className="mt-1 break-words text-lg font-semibold">{o.description}</p></div>
        <StatusBadge status={o.status} />
      </div>
      <div className="flex items-baseline gap-2"><span className="text-3xl font-bold text-near">{amt}</span><span className="rounded bg-bg px-2 py-0.5 text-xs font-semibold">{sym}</span></div>
      <p className="text-xs text-mute">{t('oc.seller')}: <span className="text-ink">{o.seller}</span><br />{t('pp.info', { h: o.ship_window_hours })}</p>
      {body}
    </div>
  );
}
