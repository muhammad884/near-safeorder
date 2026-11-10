import { useEffect, useState } from 'react';
import { connector } from '../lib/near';

export function useWallet() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const c: any = connector;
    const onIn = (p: any) => { const id = p?.accounts?.[0]?.accountId; if (alive && id) setAccountId(id); };
    const onOut = () => { if (alive) setAccountId(null); };
    c.on('wallet:signIn', onIn);
    c.on('wallet:signOut', onOut);
    (async () => {
      try {
        const w = await c.wallet();
        const a = await w.getAccounts();
        if (alive && a?.[0]?.accountId) setAccountId(a[0].accountId);
      } catch { /* not connected */ }
      if (alive) setReady(true);
    })();
    return () => { alive = false; c.off?.('wallet:signIn', onIn); c.off?.('wallet:signOut', onOut); };
  }, []);
  const connect = () => { (connector as any).connect(); };
  const disconnect = async () => {
    try { const c: any = connector; const w = await c.wallet(); await c.disconnect(w); } catch { /* ignore */ }
    setAccountId(null);
  };
  return { accountId, ready, connect, disconnect };
}
