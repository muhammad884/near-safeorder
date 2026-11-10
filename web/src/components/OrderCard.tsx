import { ExternalLink, Loader2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { DECIMALS, SYMBOL, fromUnits, payNear, payUsdc, markShipped, confirmDelivery, openDispute, requestRefund, sellerRefund } from '../lib/near';
import { getTxs } from '../lib/txlog';
import { EXPLORER } from '../lib/config';
import type { Order, RunFn } from '../types';

function Btn({ onClick, disabled, tone = 'main', children }: { onClick: () => void; disabled?: boolean; tone?: 'main' | 'ghost' | 'warn'; children: React.ReactNode }) {
  const c = tone === 'main' ? 'bg-near text-onnear' : tone === 'warn' ? 'border border-red-400/40 text-red-600 dark:text-red-300' : 'border border-line text-ink';
  return <button onClick={onClick} disabled={disabled} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 ${c}`}>{children}</button>;
}

export default function OrderCard({ order: o, me, busy, run }: { order: Order; me: string; busy: string | null; run: RunFn }) {
  const isBuyer = me === o.buyer, isSeller = me === o.seller;
  const deadline = o.ship_deadline ? Number(BigInt(o.ship_deadline) / 1_000_000n) : null;
  const expired = deadline !== null && Date.now() > deadline;
  const txs = getTxs(o.id);
  const act = (label: string, fn: () => Promise<string[]>) => () => run(label, fn, o.id);
  const off = !!busy;
  const buttons: React.ReactNode[] = [];

  if (isBuyer && o.status === 'Created')
    buttons.push(<Btn key="pay" disabled={off} onClick={act('Pay', () => (o.token === 'Near' ? payNear(o) : payUsdc(o)))}>Pay {fromUnits(o.amount, DECIMALS[o.token])} {SYMBOL[o.token]}</Btn>);
  if (isSeller && o.status === 'Funded' && !expired)
    buttons.push(<Btn key="ship" disabled={off} onClick={act('Mark shipped', () => markShipped(o))}>Mark as shipped</Btn>);
  if (isBuyer && (o.status === 'Shipped' || o.status === 'Disputed'))
    buttons.push(<Btn key="conf" disabled={off} onClick={act('Confirm delivery', () => confirmDelivery(o))}>Confirm delivery</Btn>);
  if (isBuyer && o.status === 'Shipped')
    buttons.push(<Btn key="disp" tone="warn" disabled={off} onClick={act('Open dispute', () => openDispute(o))}>Report a problem</Btn>);
  if (isBuyer && o.status === 'Funded' && expired)
    buttons.push(<Btn key="ref" disabled={off} onClick={act('Request refund', () => requestRefund(o))}>Request refund</Btn>);
  if (isSeller && ['Funded', 'Shipped', 'Disputed'].includes(o.status))
    buttons.push(<Btn key="sref" tone="ghost" disabled={off} onClick={act('Refund buyer', () => sellerRefund(o))}>Refund buyer</Btn>);

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-mute">Order #{o.id} · you are the {isBuyer ? 'buyer' : 'seller'}</p>
          <p className="mt-1 break-words font-semibold">{o.description}</p>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-near">{fromUnits(o.amount, DECIMALS[o.token])}</span>
        <span className="rounded bg-bg px-2 py-0.5 text-xs font-semibold">{SYMBOL[o.token]}</span>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-mute">
        <div className="truncate">Buyer: <span className="text-ink">{o.buyer}</span></div>
        <div className="truncate">Seller: <span className="text-ink">{o.seller}</span></div>
        {deadline !== null && (
          <div>Ship by: <span className={expired && o.status === 'Funded' ? 'text-red-600 dark:text-red-300' : 'text-ink'}>{new Date(deadline).toLocaleString()}{expired && o.status === 'Funded' ? ' (passed)' : ''}</span></div>
        )}
      </dl>
      {o.status === 'Created' && isSeller && <p className="mt-3 text-xs text-mute">Waiting for the buyer to pay into escrow.</p>}
      {o.status === 'Disputed' && <p className="mt-3 text-xs text-red-600 dark:text-red-300">Funds are locked. The buyer can still confirm delivery, or the seller can refund the buyer.</p>}
      {(o.status === 'Releasing' || o.status === 'Refunding') && (
        <p className="mt-3 flex items-center gap-2 text-xs text-violet-600 dark:text-violet-300"><Loader2 className="h-3 w-3 animate-spin" />Payout in progress…</p>
      )}
      {buttons.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{buttons}</div>}
      {txs.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 text-xs text-mute">
          {txs.map((t, i) => (
            <a key={i} href={`${EXPLORER}/txns/${t.hash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 py-0.5 hover:text-near">
              <ExternalLink className="h-3 w-3" />{t.label} · {t.hash.slice(0, 10)}…
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
