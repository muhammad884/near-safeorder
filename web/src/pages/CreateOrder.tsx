import { useState } from 'react';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import { DECIMALS, SYMBOL, accountExists, createInvoice, createOrder, fetchOrders, fromUnits, toUnits } from '../lib/near';
import { payLink, whatsappLink } from '../lib/links';
import { useT } from '../lib/i18n';
import type { Order, RunFn, Token } from '../types';

type P = { account: string | null; busy: string | null; onConnect: () => void; run: RunFn; onDone: () => void };
const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-near';
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export default function CreateOrder({ account, busy, onConnect, run, onDone }: P) {
  const { t } = useT();
  const [mode, setMode] = useState<'buy' | 'sell'>(sessionStorage.getItem('so-demo-role') === 'buyer' ? 'buy' : 'sell');
  const [other, setOther] = useState(sessionStorage.getItem('so-demo-peer') || '');
  const [desc, setDesc] = useState('');
  const [token, setToken] = useState<Token>('Near');
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState('48');
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<Order | null>(null);
  const [copied, setCopied] = useState(false);
  const btn = 'rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear';

  if (!account) return (
    <div className="rounded-2xl border border-line bg-card p-6 text-center">
      <p className="text-mute">{t('cr.connect')}</p>
      <button onClick={onConnect} className={`mt-4 ${btn}`}>{t('connect')}</button>
    </div>
  );

  if (made) {
    const amt = fromUnits(made.amount, DECIMALS[made.token]);
    const sym = SYMBOL[made.token];
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
        <h1 className="text-xl font-bold">{t('cr.ready')}</h1>
        <p className="text-sm text-mute">{t('cr.readyTxt')}</p>
        <p className="break-all rounded-lg bg-bg p-3 text-sm">{payLink(made.id)}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={async () => { try { await navigator.clipboard.writeText(payLink(made.id)); setCopied(true); } catch { /* ignore */ } }}
            className="flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-semibold">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? t('copied') : t('copy')}</button>
          <a href={whatsappLink(made.id, t('wa.invoice', { amt, sym, desc: made.description }))} target="_blank" rel="noreferrer"
            className={`flex items-center gap-2 ${btn}`}><MessageCircle className="h-4 w-4" />{t('cr.shareWa')}</a>
        </div>
        <button onClick={() => { setMade(null); onDone(); }} className="text-sm text-mute underline">{t('cr.goOrders')}</button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const o = other.trim().toLowerCase();
    if (mode === 'buy' ? !ID_RE.test(o) : !!o && !ID_RE.test(o)) return setErr(t('cr.e.acct'));
    if (o === account) return setErr(t('cr.e.self'));
    const d = desc.trim();
    if (!d || d.length > 280) return setErr(t('cr.e.desc'));
    let units: bigint;
    try { units = toUnits(amount, DECIMALS[token]); } catch (x) { return setErr((x as Error).message); }
    if (units <= 0n) return setErr(t('cr.e.zero'));
    const h = Number(hours);
    if (!Number.isInteger(h) || h < 1 || h > 1440) return setErr(t('cr.e.hours'));
    if (o && !(await accountExists(o))) return setErr(t('cr.e.exists', { id: o }));
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
      <h1 className="text-xl font-bold">{t('cr.title')}</h1>
      <div className="grid grid-cols-2 gap-2">
        {([['sell', 'cr.sell'], ['buy', 'cr.buy']] as const).map(([m, k]) => (
          <button type="button" key={m} onClick={() => setMode(m)}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${mode === m ? 'border-near bg-near/10 text-near' : 'border-line text-mute'}`}>{t(k)}</button>
        ))}
      </div>
      <label className="block text-sm">{mode === 'buy' ? t('cr.otherBuy') : t('cr.otherSell')}
        <input className={`${input} mt-1`} value={other} onChange={(e) => setOther(e.target.value)} placeholder={mode === 'buy' ? 'seller.testnet' : 'buyer.testnet'} autoCapitalize="none" />
      </label>
      <label className="block text-sm">{t('cr.what')}
        <textarea className={`${input} mt-1`} rows={3} maxLength={280} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="iPhone 13, 128GB" />
      </label>
      <div>
        <p className="text-sm">{t('cr.token')}</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['Near', 'Usdc'] as Token[]).map((k) => (
            <button type="button" key={k} onClick={() => setToken(k)}
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${token === k ? 'border-near bg-near/10 text-near' : 'border-line text-mute'}`}>{SYMBOL[k]}</button>
          ))}
        </div>
      </div>
      <label className="block text-sm">{t('cr.amount', { sym: SYMBOL[token] })}
        <input className={`${input} mt-1`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={token === 'Near' ? '1.5' : '25'} />
      </label>
      <label className="block text-sm">{t('cr.hours')}
        <input className={`${input} mt-1`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <p className="text-xs text-mute">{t('cr.note')}</p>
      {err && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <button disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-near px-4 py-3 font-semibold text-onnear disabled:opacity-50">
        {busy === 'Create order' && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'sell' ? t('cr.submitSell') : t('cr.submitBuy')}
      </button>
    </form>
  );
}
