import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DECIMALS, SYMBOL, accountExists, createOrder, toUnits } from '../lib/near';
import type { RunFn, Token } from '../types';

type P = { account: string | null; busy: string | null; onConnect: () => void; run: RunFn; onDone: () => void };
const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-near';

export default function CreateOrder({ account, busy, onConnect, run, onDone }: P) {
  const [seller, setSeller] = useState('');
  const [desc, setDesc] = useState('');
  const [token, setToken] = useState<Token>('Near');
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState('48');
  const [err, setErr] = useState<string | null>(null);

  if (!account) return (
    <div className="rounded-2xl border border-line bg-card p-6 text-center">
      <p className="text-mute">Connect your NEAR wallet to create an order.</p>
      <button onClick={onConnect} className="mt-4 rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear">Connect wallet</button>
    </div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const s = seller.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(s)) return setErr('Enter a valid NEAR account ID for the seller');
    if (s === account) return setErr('The seller cannot be your own account');
    if (!desc.trim() || desc.length > 280) return setErr('Description must be 1–280 characters');
    let units: bigint;
    try { units = toUnits(amount, DECIMALS[token]); } catch (x) { return setErr((x as Error).message); }
    if (units <= 0n) return setErr('Amount must be greater than zero');
    const h = Number(hours);
    if (!Number.isInteger(h) || h < 1 || h > 1440) return setErr('Shipping window must be 1–1440 hours');
    if (!(await accountExists(s))) return setErr(`Account ${s} does not exist on testnet`);
    const ok = await run('Create order', () => createOrder({ seller: s, description: desc.trim(), token, amount: units, hours: h }));
    if (ok) { setSeller(''); setDesc(''); setAmount(''); onDone(); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h1 className="text-xl font-bold">Create order</h1>
      <label className="block text-sm">Seller account
        <input className={`${input} mt-1`} value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="seller.testnet" autoCapitalize="none" />
      </label>
      <label className="block text-sm">What is being bought
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
      <label className="block text-sm">Seller must ship within (hours of payment)
        <input className={`${input} mt-1`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <p className="text-xs text-mute">Creating an order attaches 0.01 NEAR to cover storage; the unused part is refunded automatically. You pay the escrow amount in the next step from My Orders.</p>
      {err && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <button disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-near px-4 py-3 font-semibold text-onnear disabled:opacity-50">
        {busy === 'Create order' && <Loader2 className="h-4 w-4 animate-spin" />}Create order
      </button>
    </form>
  );
}
