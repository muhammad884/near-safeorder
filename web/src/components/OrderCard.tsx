import { useState } from 'react';
import { Copy, ExternalLink, Loader2, MessageCircle } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { DECIMALS, SYMBOL, fromUnits, toUnits, payNear, payUsdc, markShipped, confirmDelivery, openDispute, requestRefund, sellerRefund, proposeSettlement, acceptSettlement, retrySettlement } from '../lib/near';
import { getTxs } from '../lib/txlog';
import { payLink, whatsappLink } from '../lib/links';
import { EXPLORER } from '../lib/config';
import type { Order, RunFn } from '../types';

function Btn({ onClick, disabled, tone = 'main', children }: { onClick: () => void; disabled?: boolean; tone?: 'main' | 'ghost' | 'warn'; children: React.ReactNode }) {
  const c = tone === 'main' ? 'bg-near text-onnear' : tone === 'warn' ? 'border border-red-400/40 text-red-600 dark:text-red-300' : 'border border-line text-ink';
  return <button onClick={onClick} disabled={disabled} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 ${c}`}>{children}</button>;
}
const field = 'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-near';

export default function OrderCard({ order: o, me, busy, run }: { order: Order; me: string; busy: string | null; run: RunFn }) {
  const isBuyer = me === o.buyer, isSeller = me === o.seller;
  const dec = DECIMALS[o.token], sym = SYMBOL[o.token];
  const amt = fromUnits(o.amount, dec);
  const deadline = o.ship_deadline ? Number(BigInt(o.ship_deadline) / 1_000_000n) : null;
  const expired = deadline !== null && Date.now() > deadline;
  const txs = getTxs(o.id);
  const off = !!busy;
  const [share, setShare] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const act = (label: string, fn: () => Promise<string[]>) => () => run(label, fn, o.id);
  const p = o.proposal;
  const negotiate = (isBuyer || isSeller) && (o.status === 'Shipped' || o.status === 'Disputed');

  function propose() {
    try {
      const u = toUnits(share, dec);
      if (u > BigInt(o.amount)) return setErr(`Max ${amt} ${sym}`);
      if (note.length > 140) return setErr('Note: max 140 characters');
      setErr(null);
      run('Propose split', () => proposeSettlement(o, u, note.trim()), o.id);
    } catch (e) { setErr((e as Error).message); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(payLink(o.id)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  const buttons: React.ReactNode[] = [];
  if (isBuyer && o.status === 'Created')
    buttons.push(<Btn key="pay" disabled={off} onClick={act('Pay', () => (o.token === 'Near' ? payNear(o) : payUsdc(o, me)))}>Pay {amt} {sym}</Btn>);
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
  if ((isBuyer || isSeller) && o.status === 'Settling')
    buttons.push(<Btn key="retry" disabled={off} onClick={act('Retry payout', () => retrySettlement(o))}>Retry payout</Btn>);

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
        <span className="text-2xl font-bold text-near">{amt}</span>
        <span className="rounded bg-bg px-2 py-0.5 text-xs font-semibold">{sym}</span>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-mute">
        <div className="truncate">Buyer: <span className="text-ink">{o.buyer ?? 'anyone with the payment link'}</span></div>
        <div className="truncate">Seller: <span className="text-ink">{o.seller}</span></div>
        {deadline !== null && (
          <div>Ship by: <span className={expired && o.status === 'Funded' ? 'text-red-600 dark:text-red-300' : 'text-ink'}>{new Date(deadline).toLocaleString()}{expired && o.status === 'Funded' ? ' (passed)' : ''}</span></div>
        )}
      </dl>

      {o.status === 'Created' && isSeller && (
        <div className="mt-3 rounded-xl border border-line bg-bg p-3 text-xs">
          <p className="text-mute">Waiting for payment. Send this link to the buyer:</p>
          <p className="mt-1 break-all text-ink">{payLink(o.id)}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={copy} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-semibold"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy link'}</button>
            <a href={whatsappLink(o.id, `Pay ${amt} ${sym} for "${o.description}" safely with escrow:`)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-near px-3 py-1.5 font-semibold text-onnear"><MessageCircle className="h-3 w-3" />WhatsApp</a>
          </div>
        </div>
      )}
      {o.status === 'Disputed' && <p className="mt-3 text-xs text-red-600 dark:text-red-300">Dispute open. Funds are locked until you agree on a split, the buyer confirms, or the seller refunds.</p>}
      {o.status === 'Settling' && <p className="mt-3 text-xs text-violet-600 dark:text-violet-300">Settlement payout in progress. Still owed: buyer {fromUnits(o.owed_buyer, dec)}, seller {fromUnits(o.owed_seller, dec)} {sym}. If it stays here, press Retry payout.</p>}
      {(o.status === 'Releasing' || o.status === 'Refunding') && (
        <p className="mt-3 flex items-center gap-2 text-xs text-violet-600 dark:text-violet-300"><Loader2 className="h-3 w-3 animate-spin" />Payout in progress…</p>
      )}

      {negotiate && (
        <div className="mt-4 rounded-xl border border-line bg-bg p-3 text-sm">
          <p className="font-semibold">Agree on a split</p>
          {p ? (
            <div className="mt-2 text-xs">
              <p>{p.by === me ? 'You' : p.by} proposed: buyer gets <b>{fromUnits(p.buyer_amount, dec)}</b>, seller gets <b>{fromUnits(BigInt(o.amount) - BigInt(p.buyer_amount), dec)}</b> {sym}</p>
              {p.note && <p className="mt-1 italic text-mute">“{p.note}”</p>}
              {p.by !== me
                ? <div className="mt-2"><Btn disabled={off} onClick={act('Accept split', () => acceptSettlement(o))}>Accept this split</Btn></div>
                : <p className="mt-1 text-mute">Waiting for the other side to accept.</p>}
            </div>
          ) : <p className="mt-1 text-xs text-mute">No proposal yet. Suggest how much the buyer gets back; the rest goes to the seller.</p>}
          <div className="mt-3 grid gap-2">
            <input className={field} inputMode="decimal" placeholder={`Buyer gets (${sym}), 0 to ${amt}`} value={share} onChange={(e) => setShare(e.target.value)} />
            <input className={field} maxLength={140} placeholder="Short note (optional, max 140)" value={note} onChange={(e) => setNote(e.target.value)} />
            {err && <p className="text-xs text-red-600 dark:text-red-300">{err}</p>}
            <div><Btn tone="ghost" disabled={off || !share} onClick={propose}>Propose split</Btn></div>
          </div>
        </div>
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
