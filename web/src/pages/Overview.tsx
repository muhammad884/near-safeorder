import { ShieldCheck, PackageCheck, Truck, Wallet, ExternalLink } from 'lucide-react';
import { CONTRACT_ID, USDC_ID, EXPLORER } from '../lib/config';
import type { Order, Page } from '../types';

type P = { account: string | null; orders: Order[]; total: number | null; onNav: (p: Page) => void; onConnect: () => void };

export default function Overview({ account, orders, total, onNav, onConnect }: P) {
  const active = orders.filter((o) => ['Funded', 'Shipped', 'Disputed', 'Releasing', 'Refunding'].includes(o.status)).length;
  const done = orders.filter((o) => o.status === 'Released' || o.status === 'Settled').length;
  const refunded = orders.filter((o) => o.status === 'Refunded').length;
  const steps = [
    { icon: Wallet, t: '1. Buyer pays into escrow', d: 'Funds (NEAR or native USDC) are locked in the smart contract, not sent to the seller.' },
    { icon: Truck, t: '2. Seller ships', d: 'Only the seller can mark the order as shipped, before the agreed deadline.' },
    { icon: PackageCheck, t: '3. Buyer confirms', d: 'Only the buyer can confirm delivery. The contract then releases the exact amount to the seller.' },
  ];
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-6">
        <ShieldCheck className="h-9 w-9 text-near" />
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Safe payments for online orders</h1>
        <p className="mt-2 max-w-2xl text-mute">Buying through WhatsApp, Instagram or Telegram? Pay into a NEAR smart contract. The seller is paid only after you confirm delivery.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {account ? <button onClick={() => onNav('create')} className="rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear">Create an order</button>
            : <button onClick={onConnect} className="rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear">Connect wallet</button>}
          {account && <button onClick={() => onNav('orders')} className="rounded-lg border border-line px-4 py-2.5 font-semibold">My orders</button>}
        </div>
      </section>

      {account && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Your orders', orders.length], ['In progress', active], ['Completed', done], ['Refunded', refunded]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-line bg-card p-4"><p className="text-xs text-mute">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
          ))}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: I, t, d }) => (
          <div key={t} className="rounded-xl border border-line bg-card p-4"><I className="h-5 w-5 text-near" /><p className="mt-2 font-semibold">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></div>
        ))}
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 text-sm">
        <h2 className="font-semibold">Refund and dispute rules</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-mute">
          <li>If the seller never ships before the deadline, the buyer can request a refund.</li>
          <li>Once shipped, there is no automatic refund. The buyer confirms delivery, or reports a problem.</li>
          <li>A reported problem locks the funds. The contract cannot judge who is right, and there is no arbitration in this MVP. The buyer can still confirm, or the seller can refund the buyer.</li>
          <li>The seller is never paid just because the buyer stayed silent.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 text-xs text-mute">
        <p>Network: NEAR Testnet{total !== null ? ` · ${total} orders created on this contract` : ''}</p>
        <a className="mt-1 flex items-center gap-1 break-all hover:text-near" href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 shrink-0" />Contract: {CONTRACT_ID}</a>
        <a className="mt-1 flex items-center gap-1 break-all hover:text-near" href={`${EXPLORER}/address/${USDC_ID}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 shrink-0" />USDC (Circle native): {USDC_ID}</a>
      </section>
    </div>
  );
}
