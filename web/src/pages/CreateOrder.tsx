import { useState } from 'react';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import { DECIMALS, SYMBOL, accountExists, createInvoice, createOrder, fetchOrders, fromUnits, toUnits } from '../lib/near';
import { payLink, whatsappLink } from '../lib/links';
import type { Order, RunFn, Token } from '../types';

type P = { account: string | null; busy: string | null; onConnect: () => void; run: RunFn; onDone: () => void };
const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-near';
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export default function CreateOrder({ account, busy, onConnect, run, onDone }: P) {
  const [mode, setMode] = useState<'buy' | 'sell'>('sell');
  const [other, setOther] = useState('');
  const [desc, setDesc] = useState('');
  const [token, setToken] = useState<Token>('Near');
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState('48');
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<Order | null>(null);
  const [copied, setCopied] = useState(false);

  if (!account) return (
    <div className="rounded-2xl border border-line bg-card p-6 text-center">
      <p className="text-mute">Connect your NEAR wallet to create an order.</p>
      <button onClick={onConnect} className="mt-4 rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear">Connect wallet</button>
    </div>
  );

  if (made) {
    const amt = fromUnits(made.amount, DECIMALS[made.token]);
    const sym = SYMBOL[made.token];
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
        <h1 className="text-xl font-bold">Payment link ready</h1>
        <p className="text-sm text-mute">Send this link to your buyer. They pay into escrow, you ship, they confirm, and you get paid.</p>
        <p className="break-all rounded-lg bg-bg p-3 text-sm">{payLink(made.id)}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={async () => { try { await navigator.clipboard.writeText(payLink(made.id)); setCopied(true); } catch { /* ignore */ } }}
            className="flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-semibold">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}</button>
          <a href={whatsappLink(made.id, `Pay ${amt} ${sym} for "${made.description}" safely with escrow:`)} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear"><MessageCircle className="h-4 w-4" />Share on WhatsApp</a>
        </div>
        <button onClick={() => { setMade(null); onDone(); }} className="text-sm text-mute underline">Go to My Orders</button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const o = other.trim().toLowerCase();
    if (mode === 'buy') {
      if (!ID_RE.test(o)) return setErr('Enter a valid NEAR account ID for the seller');
    } else if (o && !ID_RE.test(o)) return setErr('Buyer must be a valid NEAR account ID, or leave it empty');
    if (o === account) return setErr('The other party cannot be your own account');
    const d = desc.trim();
    if (!d || d.length > 280) return setErr('Description must be 1–280 characters');
    let units: bigint;
    try { units = toUnits(amount, DECIMALS[token]); } catch (x) { return setErr((x as Error).message); }
    if (units <= 0n) return setErr('Amount must be greater than zero');
    const h = Number(hours);
    if (!Number.isInteger(h) || h < 1 || h > 1440) return setErr('Shipping window must be 1–1440 hours');
    if (o && !(await accountExists(o))) return setErr(`Account ${o} does not exist on testnet`);
    const ok = await run('Create order', () =>
      mode === 'buy'
        ? createOrder({ seller: o, description: d, token, amount: units, hours: h })
        : createInvoice({ description: d, token, amount: units, hours: h, buyer: o || null }));
    if (!ok) return;
    setDesc(''); setAmount(''); setOther('');
    if (mode === 'sell') {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const list = await fetchOrders(account!);
          const m = list.find((x) => x.seller === account && x.description === d && x.amount === units.toString() && x.status === 'Created');
          if (m) { setMade(m); return; }
        } catch { /* retry */ }
      }
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h1 className="text-xl font-bold">Create order</h1>
      <div className="grid grid-cols-2 gap-2">
        {([['sell', 'I am selling'], ['buy', 'I am buying']] as const).map(([m, l]) => (
          <button type="button" key={m} onClick={() => setMode(m)}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${mode === m ? 'border-near bg-near/10 text-near' : 'border-line text-mute'}`}>{l}</button>
        ))}
      </div>
      <label className="block text-sm">{mode === 'buy' ? 'Seller account' : 'Buyer account (optional, empty = anyone with the link)'}
        <input className={`${input} mt-1`} value={other} onChange={(e) => setOther(e.target.value)} placeholder={mode === 'buy' ? 'seller.testnet' : 'buyer.testnet'} autoCapitalize="none" />
      </label>
      <label className="block text-sm">What is being sold
        <textarea className={`${input} mt-1`} rows={3} maxLength={280} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. iPhone 13, 128GB, black" />
      </label>
      <div>
        <p className="text-sm">Payment token</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['Near', 'Usdc'] as Token[]).map((t) => (
            <button type="button" key={t} onClick={() => setToken(t)}
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${token === t ? 'border-near bg-near/10 text-near' : 'border-line text-mute'}`}>{SYMBOL[t]}</button>
          ))}
        </div>
      </div>
      <label className="block text-sm">Amount ({SYMBOL[token]})
        <input className={`${input} mt-1`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={token === 'Near' ? '1.5' : '25'} />
      </label>
      <label className="block text-sm">Seller must ship within (hours after payment)
        <input className={`${input} mt-1`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <p className="text-xs text-mute">Creating an order attaches 0.01 NEAR to cover storage; the unused part is refunded automatically. The escrow amount is paid in the next step.</p>
      {err && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <button disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-near px-4 py-3 font-semibold text-onnear disabled:opacity-50">
        {busy === 'Create order' && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'sell' ? 'Create payment link' : 'Create order'}
      </button>
    </form>
  );
}
