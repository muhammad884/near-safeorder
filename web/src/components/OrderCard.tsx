import { useState } from 'react';
import { Copy, ExternalLink, Loader2, MessageCircle } from 'lucide-react';
import StatusBadge from './StatusBadge';
import StatusTracker from './StatusTracker';
import { DECIMALS, SYMBOL, fromUnits, toUnits, payNear, payUsdc, markShipped, confirmDelivery, openDispute, requestRefund, sellerRefund, proposeSettlement, acceptSettlement, retrySettlement } from '../lib/near';
import { getTxs } from '../lib/txlog';
import { payLink, whatsappLink, waText } from '../lib/links';
import { useT } from '../lib/i18n';
import { EXPLORER } from '../lib/config';
import type { Order, RunFn } from '../types';

function Btn({ onClick, disabled, tone = 'main', children }: { onClick: () => void; disabled?: boolean; tone?: 'main' | 'ghost' | 'warn'; children: React.ReactNode }) {
  const c = tone === 'main' ? 'bg-near text-onnear' : tone === 'warn' ? 'border border-red-400/40 text-red-600 dark:text-red-300' : 'border border-line text-ink';
  return <button onClick={onClick} disabled={disabled} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 ${c}`}>{children}</button>;
}
const field = 'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-near';

export default function OrderCard({ order: o, me, busy, run }: { order: Order; me: string; busy: string | null; run: RunFn }) {
  const { t, act: actName } = useT();
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
      if (u > BigInt(o.amount)) return setErr(t('oc.maxErr', { max: amt, sym }));
      if (note.length > 140) return setErr(t('oc.noteErr'));
      setErr(null);
      run('Propose split', () => proposeSettlement(o, u, note.trim()), o.id);
    } catch (e) { setErr((e as Error).message); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(payLink(o.id)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  const buttons: React.ReactNode[] = [];
  if (isBuyer && o.status === 'Created')
    buttons.push(<Btn key="pay" disabled={off} onClick={act('Pay', () => (o.token === 'Near' ? payNear(o) : payUsdc(o, me)))}>{t('b.pay', { amt, sym })}</Btn>);
  if (isSeller && o.status === 'Funded' && !expired)
    buttons.push(<Btn key="ship" disabled={off} onClick={act('Mark shipped', () => markShipped(o))}>{t('b.ship')}</Btn>);
  if (isBuyer && (o.status === 'Shipped' || o.status === 'Disputed'))
    buttons.push(<Btn key="conf" disabled={off} onClick={act('Confirm delivery', () => confirmDelivery(o))}>{t('b.confirm')}</Btn>);
  if (isBuyer && o.status === 'Shipped')
    buttons.push(<Btn key="disp" tone="warn" disabled={off} onClick={act('Open dispute', () => openDispute(o))}>{t('b.report')}</Btn>);
  if (isBuyer && o.status === 'Funded' && expired)
    buttons.push(<Btn key="ref" disabled={off} onClick={act('Request refund', () => requestRefund(o))}>{t('b.refund')}</Btn>);
  if (isSeller && ['Funded', 'Shipped', 'Disputed'].includes(o.status))
    buttons.push(<Btn key="sref" tone="ghost" disabled={off} onClick={act('Refund buyer', () => sellerRefund(o))}>{t('b.sref')}</Btn>);
  if ((isBuyer || isSeller) && o.status === 'Settling')
    buttons.push(<Btn key="retry" disabled={off} onClick={act('Retry payout', () => retrySettlement(o))}>{t('b.retry')}</Btn>);

  let notifyKey: string | null = null;
  if (isBuyer && o.status === 'Funded') notifyKey = 'nt.paid';
  else if (isSeller && o.status === 'Shipped') notifyKey = 'nt.shipped';
  else if ((isBuyer || isSeller) && o.status === 'Disputed') notifyKey = 'nt.disp';

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-mute">{t('oc.head', { id: o.id, role: t(isBuyer ? 'role.buyer' : 'role.seller') })}</p>
          <p className="mt-1 break-words font-semibold">{o.description}</p>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-near">{amt}</span>
        <span className="rounded bg-bg px-2 py-0.5 text-xs font-semibold">{sym}</span>
      </div>
      <StatusTracker status={o.status} />
      <dl className="mt-4 grid gap-1 text-xs text-mute">
        <div className="truncate">{t('oc.buyer')}: <span className="text-ink">{o.buyer ?? t('oc.anyone')}</span></div>
        <div className="truncate">{t('oc.seller')}: <span className="text-ink">{o.seller}</span></div>
        {deadline !== null && (
          <div>{t('oc.shipby')}: <span className={expired && o.status === 'Funded' ? 'text-red-600 dark:text-red-300' : 'text-ink'}>{new Date(deadline).toLocaleString()}{expired && o.status === 'Funded' ? t('oc.passed') : ''}</span></div>
        )}
      </dl>

      {o.status === 'Created' && isSeller && (
        <div className="mt-3 rounded-xl border border-line bg-bg p-3 text-xs">
          <p className="text-mute">{t('oc.wait')}</p>
          <p className="mt-1 break-all text-ink">{payLink(o.id)}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={copy} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-semibold"><Copy className="h-3 w-3" />{copied ? t('copied') : t('copy')}</button>
            <a href={whatsappLink(o.id, t('wa.invoice', { amt, sym, desc: o.description }))} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-near px-3 py-1.5 font-semibold text-onnear"><MessageCircle className="h-3 w-3" />WhatsApp</a>
          </div>
        </div>
      )}
      {o.status === 'Disputed' && <p className="mt-3 text-xs text-red-600 dark:text-red-300">{t('oc.disputed')}</p>}
      {o.status === 'Settling' && <p className="mt-3 text-xs text-violet-600 dark:text-violet-300">{t('oc.settling', { b: fromUnits(o.owed_buyer, dec), s: fromUnits(o.owed_seller, dec), sym })}</p>}
      {(o.status === 'Releasing' || o.status === 'Refunding') && (
        <p className="mt-3 flex items-center gap-2 text-xs text-violet-600 dark:text-violet-300"><Loader2 className="h-3 w-3 animate-spin" />{t('oc.paying')}</p>
      )}

      {negotiate && (
        <div className="mt-4 rounded-xl border border-line bg-bg p-3 text-sm">
          <p className="font-semibold">{t('oc.negTitle')}</p>
          {p ? (
            <div className="mt-2 text-xs">
              <p>{t('oc.proposed', { who: p.by === me ? t('oc.you') : p.by, b: fromUnits(p.buyer_amount, dec), s: fromUnits(BigInt(o.amount) - BigInt(p.buyer_amount), dec), sym })}</p>
              {p.note && <p className="mt-1 italic text-mute">“{p.note}”</p>}
              {p.by !== me
                ? <div className="mt-2"><Btn disabled={off} onClick={act('Accept split', () => acceptSettlement(o, p.buyer_amount))}>{t('oc.accept')}</Btn></div>
                : <p className="mt-1 text-mute">{t('oc.waitOther')}</p>}
            </div>
          ) : <p className="mt-1 text-xs text-mute">{t('oc.noProp')}</p>}
          <div className="mt-3 grid gap-2">
            <input className={field} inputMode="decimal" placeholder={t('oc.share', { sym, max: amt })} value={share} onChange={(e) => setShare(e.target.value)} />
            <input className={field} maxLength={140} placeholder={t('oc.note')} value={note} onChange={(e) => setNote(e.target.value)} />
            {err && <p className="text-xs text-red-600 dark:text-red-300">{err}</p>}
            <div><Btn tone="ghost" disabled={off || !share} onClick={propose}>{t('oc.propose')}</Btn></div>
          </div>
        </div>
      )}

      {(buttons.length > 0 || notifyKey) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {buttons}
          {notifyKey && (
            <a href={waText(t(notifyKey, { amt, sym, id: o.id, desc: o.description, link: payLink(o.id) }))} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold"><MessageCircle className="h-4 w-4" />{t('nt.btn')}</a>
          )}
        </div>
      )}
      {txs.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 text-xs text-mute">
          {txs.map((x, i) => (
            <a key={i} href={`${EXPLORER}/txns/${x.hash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 py-0.5 hover:text-near">
              <ExternalLink className="h-3 w-3" />{actName(x.label)} · {x.hash.slice(0, 10)}…
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
