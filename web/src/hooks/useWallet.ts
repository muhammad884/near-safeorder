import { useEffect, useState } from 'react';
import { KeyPair } from 'near-api-js';
import { connector, checkKey } from '../lib/near';
import { devSession, startDev, stopDev, publicKeyOf } from '../lib/devwallet';

export type Role = 'buyer' | 'seller';
export type Demo = { buyer: { id: string; key: string }; seller: { id: string; key: string }; role: Role };
const DEMO_KEY = 'so-demo';
const FAUCET = 'https://helper.nearprotocol.com/account';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeAcct(role: Role) {
  const id = `demo${role}-${Math.random().toString(36).slice(2, 8)}.testnet`;
  const kp = KeyPair.fromRandom('ed25519');
  const pub = kp.getPublicKey().toString();
  const res = await fetch(FAUCET, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: pub }),
  });
  if (!res.ok) throw new Error(`Testnet faucet unavailable (${res.status}). Try again in a minute.`);
  for (let i = 0; i < 12; i++) {
    await sleep(1500);
    try { await checkKey(id, pub); return { id, key: kp.toString() }; } catch { /* not ready yet */ }
  }
  throw new Error('The demo account was not ready in time. Please try again.');
}

export function useWallet() {
  const [walletId, setWalletId] = useState<string | null>(null);
  const [devId, setDevId] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const activate = (d: Demo) => {
    const me = d[d.role];
    const peer = d[d.role === 'buyer' ? 'seller' : 'buyer'];
    startDev(me.id, me.key);
    setDevId(me.id);
    setDemo(d);
    try {
      sessionStorage.setItem(DEMO_KEY, JSON.stringify(d));
      sessionStorage.setItem('so-demo-role', d.role);
      sessionStorage.setItem('so-demo-peer', peer.id);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let alive = true;
    const c: any = connector;
    const onIn = (p: any) => { const id = p?.accounts?.[0]?.accountId; if (alive && id) setWalletId(id); };
    const onOut = () => { if (alive) setWalletId(null); };
    c.on('wallet:signIn', onIn);
    c.on('wallet:signOut', onOut);
    try { const raw = sessionStorage.getItem(DEMO_KEY); if (raw) activate(JSON.parse(raw)); } catch { /* ignore */ }
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

  const startDemo = async () => {
    setDemoErr(null); setDemoBusy(true);
    try {
      const [b, s] = await Promise.all([makeAcct('buyer'), makeAcct('seller')]);
      activate({ buyer: b, seller: s, role: 'buyer' });
    } catch (e) { setDemoErr((e as Error).message); }
    finally { setDemoBusy(false); }
  };
  const switchRole = (role: Role) => { if (demo) activate({ ...demo, role }); };
  const exitDemo = () => {
    stopDev(); setDevId(null); setDemo(null);
    try { ['so-demo', 'so-demo-role', 'so-demo-peer'].forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
  };

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
    if (demo) return exitDemo();
    if (devSession()) { stopDev(); setDevId(null); return; }
    try { const c: any = connector; const w = await c.wallet(); await c.disconnect(w); } catch { /* ignore */ }
    setWalletId(null);
  };
  return { accountId: devId ?? walletId, ready, connect, loginDev, disconnect, demo, demoBusy, demoErr, startDemo, switchRole, exitDemo };
}
