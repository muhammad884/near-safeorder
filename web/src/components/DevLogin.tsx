import { useState } from 'react';

type P = { onLogin: (id: string, key: string) => Promise<void> };
export default function DevLogin({ onLogin }: P) {
  const [id, setId] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (import.meta.env.VITE_DEV_LOGIN === 'off') return null;
  async function go() {
    setErr(null); setLoading(true);
    try { await onLogin(id, key); setKey(''); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-near';
  return (
    <details className="rounded-xl border border-line bg-card p-3 text-sm">
      <summary className="cursor-pointer text-mute">Testnet dev login (if your wallet does not open)</summary>
      <div className="mt-3 space-y-2">
        <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">Testnet only. Use a throwaway testnet key, never a real one. The key stays in this tab's memory and is never saved.</p>
        <input className={field} placeholder="account.testnet" autoCapitalize="none" value={id} onChange={(e) => setId(e.target.value)} />
        <input className={field} type="password" autoComplete="off" placeholder="ed25519:… private key" value={key} onChange={(e) => setKey(e.target.value)} />
        {err && <p className="text-xs text-red-600 dark:text-red-300">{err}</p>}
        <button onClick={go} disabled={loading || !id || !key} className="rounded-lg bg-near px-4 py-2 font-semibold text-onnear disabled:opacity-40">{loading ? 'Checking…' : 'Sign in'}</button>
      </div>
    </details>
  );
}
