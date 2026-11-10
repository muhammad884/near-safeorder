import { useEffect, useState } from 'react';
import { connector, checkKey } from '../lib/near';
import { devSession, startDev, stopDev, publicKeyOf } from '../lib/devwallet';

export function useWallet() {
  const [walletId, setWalletId] = useState<string | null>(null);
  const [devId, setDevId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const c: any = connector;
    const onIn = (p: any) => { const id = p?.accounts?.[0]?.accountId; if (alive && id) setWalletId(id); };
    const onOut = () => { if (alive) setWalletId(null); };
    c.on('wallet:signIn', onIn);
    c.on('wallet:signOut', onOut);
    (async () => {
      try {
        const w = await c.wallet();
        const a = await w.getAccounts();
        if (alive && a?.[0]?.accountId) setWalletId(a[0].accountId);
      } catch { /* not connected */ }
      if (alive) setReady(true);
    })();
    return () => { alive = false; c.off?.('wallet:signIn', onIn); c.off?.('wallet:signOut', onOut); };
  }, []);
  const connect = () => { (connector as any).connect(); };
  const loginDev = async (id: string, secret: string) => {
    const acct = id.trim().toLowerCase();
    const key = secret.trim();
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,100}$/.test(key)) throw new Error('Private key must look like ed25519:…');
    let pub: string;
    try { pub = publicKeyOf(key); } catch { throw new Error('Invalid private key'); }
    try { await checkKey(acct, pub); } catch { throw new Error('This key does not belong to that account on testnet'); }
    startDev(acct, key);
    setDevId(acct);
  };
  const disconnect = async () => {
    if (devSession()) { stopDev(); setDevId(null); return; }
    try { const c: any = connector; const w = await c.wallet(); await c.disconnect(w); } catch { /* ignore */ }
    setWalletId(null);
  };
  return { accountId: devId ?? walletId, ready, connect, loginDev, disconnect };
}
