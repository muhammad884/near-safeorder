import { NearConnector } from '@hot-labs/near-connect';
import { CONTRACT_ID, USDC_ID, RPC_URL } from './config';
import type { Order, Token } from '../types';
import { devSession, devSend } from './devwallet';

export const connector = new NearConnector({ network: 'testnet', features: { testnet: true } });

const TGAS = 10n ** 12n;
export const DECIMALS: Record<Token, number> = { Near: 24, Usdc: 6 };
export const SYMBOL: Record<Token, string> = { Near: 'NEAR', Usdc: 'USDC' };

export function toUnits(v: string, d: number): bigint {
  const [i, f = ''] = v.trim().split('.');
  if (!/^\d+$/.test(i || '') || (f !== '' && !/^\d+$/.test(f))) throw new Error('Enter a valid amount');
  if (f.length > d) throw new Error(`Max ${d} decimal places`);
  return BigInt(i) * 10n ** BigInt(d) + BigInt((f + '0'.repeat(d)).slice(0, d) || '0');
}
export function fromUnits(v: string | bigint, d: number): string {
  const s = BigInt(v).toString().padStart(d + 1, '0');
  const int = s.slice(0, -d);
  const frac = s.slice(-d).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

const errText = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
async function rpc(method: string, params: unknown) {
  const r = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'so', method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(errText(j.error.data ?? j.error.message ?? j.error));
  if (j.result?.error) throw new Error(errText(j.result.error));
  return j.result;
}
export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const res = await rpc('query', {
    request_type: 'call_function', finality: 'optimistic', account_id: contractId,
    method_name: method, args_base64: btoa(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(res.result)));
}
export async function accountExists(id: string): Promise<boolean> {
  try { await rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: id }); return true; }
  catch (e) { return !/does not exist|UNKNOWN_ACCOUNT/i.test(String((e as Error).message)); }
}
export async function fetchOrders(account: string): Promise<Order[]> {
  const list = await view<Order[]>(CONTRACT_ID, 'get_orders_by_account', { account_id: account, from_index: 0, limit: 50 });
  return list.reverse();
}

// ---- wallet transactions ----
const fc = (receiverId: string, methodName: string, args: object, tgas: number, deposit: bigint) => ({
  receiverId,
  actions: [{ type: 'FunctionCall', params: { methodName, args, gas: (BigInt(tgas) * TGAS).toString(), deposit: deposit.toString() } }],
});
function hashesOf(results: unknown): string[] {
  const arr = Array.isArray(results) ? results : [results];
  return arr.map((r: any) => r?.transaction?.hash ?? r?.transaction_outcome?.id ?? '').filter(Boolean);
}
const withNaj = (txs: any[]) => txs.map((tx) => ({
  ...tx,
  actions: tx.actions.map((a: any) => (a.functionCall ? a : { ...a, functionCall: {
    methodName: a.params.methodName,
    args: new TextEncoder().encode(JSON.stringify(a.params.args)),
    gas: BigInt(a.params.gas),
    deposit: BigInt(a.params.deposit),
  } })),
}));
let chosenSel = false;
async function send(txs: unknown[]): Promise<string[]> {
  if (devSession()) return devSend(txs as any[]);
  const w: any = chosen ?? (await connector.wallet());
  try {
    return hashesOf(await w.signAndSendTransactions({ transactions: chosenSel ? withNaj(txs as any[]) : txs }));
  } catch (e) {
    if (!/Unsupported NAJ action/i.test(String((e as Error)?.message || e))) throw e;
    const out: string[] = [];
    for (const tx of txs as any[]) out.push(...hashesOf(await w.signAndSendTransaction(chosenSel ? withNaj([tx])[0] : tx)));
    return out;
  }
}

export const createOrder = (p: { seller: string; description: string; token: Token; amount: bigint; hours: number }) =>
  send([fc(CONTRACT_ID, 'create_order', {
    seller: p.seller, description: p.description, amount: p.amount.toString(), token: p.token, ship_window_hours: p.hours,
  }, 30, 2n * 10n ** 22n)]); // 0.01 NEAR for storage, excess is refunded by the contract

export const payNear = (o: Order) => send([fc(CONTRACT_ID, 'pay_near', { order_id: o.id }, 30, BigInt(o.amount))]);

export async function payUsdc(o: Order, payer: string): Promise<string[]> {
  const bal = await view<string>(USDC_ID, 'ft_balance_of', { account_id: payer });
  if (BigInt(bal) < BigInt(o.amount)) throw new Error(`Not enough USDC. You have ${fromUnits(bal, 6)} USDC.`);
  const bounds = await view<{ min: string }>(USDC_ID, 'storage_balance_bounds');
  const [cReg, sReg] = await Promise.all([
    view<unknown>(USDC_ID, 'storage_balance_of', { account_id: CONTRACT_ID }),
    view<unknown>(USDC_ID, 'storage_balance_of', { account_id: o.seller }),
  ]);
  const txs: unknown[] = [];
  if (!cReg) txs.push(fc(USDC_ID, 'storage_deposit', { account_id: CONTRACT_ID, registration_only: true }, 30, BigInt(bounds.min)));
  if (!sReg) txs.push(fc(USDC_ID, 'storage_deposit', { account_id: o.seller, registration_only: true }, 30, BigInt(bounds.min)));
  txs.push(fc(USDC_ID, 'ft_transfer_call', { receiver_id: CONTRACT_ID, amount: o.amount, msg: String(o.id) }, 100, 1n));
  return send(txs);
}
const simple = (m: string, tgas: number) => (o: Order) => send([fc(CONTRACT_ID, m, { order_id: o.id }, tgas, 0n)]);
export const markShipped = simple('mark_shipped', 30);
export const openDispute = simple('open_dispute', 30);
export const confirmDelivery = simple('confirm_delivery', 100);
export const requestRefund = simple('request_refund', 100);
export const sellerRefund = simple('seller_refund', 100);

export async function checkKey(accountId: string, publicKey: string) {
  await rpc('query', { request_type: 'view_access_key', finality: 'optimistic', account_id: accountId, public_key: publicKey });
}

export const fetchOrder = (id: number) => view<Order | null>(CONTRACT_ID, 'get_order', { order_id: id });
export const createInvoice = (p: { description: string; token: Token; amount: bigint; hours: number; buyer: string | null }) =>
  send([fc(CONTRACT_ID, 'create_invoice', { description: p.description, amount: p.amount.toString(), token: p.token, ship_window_hours: p.hours, buyer: p.buyer }, 30, 2n * 10n ** 22n)]);
export const proposeSettlement = (o: Order, buyerAmount: bigint, note: string) =>
  send([fc(CONTRACT_ID, 'propose_settlement', { order_id: o.id, buyer_amount: buyerAmount.toString(), note }, 30, 0n)]);
export const acceptSettlement = (o: Order, buyerAmount: string) => send([fc(CONTRACT_ID, 'accept_settlement', { order_id: o.id, buyer_amount: buyerAmount }, 100, 0n)]);
export const retrySettlement = simple('retry_settlement', 100);

let chosen: any = null;
export function walletOptions(): { id: string; name: string; icon?: string }[] {
  const list = ((connector as any).availableWallets || []) as any[];
  const base = list
    .map((w) => ({ id: w?.manifest?.id as string, name: (w?.manifest?.name || w?.manifest?.id) as string, icon: w?.manifest?.icon as string | undefined }))
    .filter((w) => w.id && !['ledger', 'near-cli', 'meteor-wallet'].includes(w.id));
  return [{ id: 'sel:meteor-wallet', name: 'Meteor Wallet (recommended)', icon: undefined as string | undefined }, ...base];
}
export async function connectWalletById(id: string): Promise<string> {
  if (id.startsWith('sel:')) return connectSelector(id.slice(4));
  const w = (((connector as any).availableWallets || []) as any[]).find((x) => x?.manifest?.id === id);
  if (!w) throw new Error('Wallet not available');
  const accounts = await w.signIn({ network: 'testnet' });
  const acc = accounts?.[0]?.accountId ?? (await w.getAccounts())?.[0]?.accountId;
  if (!acc) throw new Error('The wallet returned no account');
  chosen = w;
  chosenSel = false;
  try { localStorage.setItem('so-wallet', id); } catch { /* ignore */ }
  return acc;
}
export async function restoreWallet(): Promise<string | null> {
  try {
    const id = localStorage.getItem('so-wallet');
    if (!id) return null;
    if (id.startsWith('sel:')) {
      const sel = await getSelector();
      if (!sel.isSignedIn()) return null;
      const sw = await sel.wallet();
      const sa = await sw.getAccounts();
      if (sa?.[0]?.accountId) { chosen = sw; chosenSel = true; return sa[0].accountId; }
      return null;
    }
    const w = (((connector as any).availableWallets || []) as any[]).find((x) => x?.manifest?.id === id);
    if (!w) return null;
    const a = await w.getAccounts();
    if (a?.[0]?.accountId) { chosen = w; chosenSel = false; return a[0].accountId; }
  } catch { /* ignore */ }
  return null;
}
export async function disconnectWallet() {
  try { await chosen?.signOut?.(); } catch { /* ignore */ }
  chosen = null;
  try { localStorage.removeItem('so-wallet'); } catch { /* ignore */ }
}
export function resetWalletStorage() {
  try { Object.keys(localStorage).filter((k) => !k.startsWith('so-') && !k.startsWith('safeorder:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  try { localStorage.removeItem('so-wallet'); } catch { /* ignore */ }
  chosen = null;
}

export async function connectViaLibrary(): Promise<string> {
  const c: any = connector;
  const w = await c.connect();
  const a = await w.getAccounts();
  const acc = a?.[0]?.accountId;
  if (!acc) throw new Error('The wallet returned no account');
  chosen = w;
  chosenSel = false;
  try { localStorage.setItem('so-wallet', w?.manifest?.id || ''); } catch { /* ignore */ }
  return acc;
}

let selectorP: Promise<any> | null = null;
export function getSelector(): Promise<any> {
  if (!selectorP) {
    selectorP = (async () => {
      const [core, meteor] = await Promise.all([import('@near-wallet-selector/core'), import('@near-wallet-selector/meteor-wallet')]);
      return core.setupWalletSelector({ network: 'testnet', modules: [meteor.setupMeteorWallet()] });
    })();
  }
  return selectorP;
}
async function connectSelector(id: string): Promise<string> {
  const sel = await getSelector();
  const w = await sel.wallet(id);
  const accounts = await w.signIn({ contractId: CONTRACT_ID, methodNames: [] });
  const acc = accounts?.[0]?.accountId;
  if (!acc) throw new Error('The wallet returned no account');
  chosen = w;
  chosenSel = true;
  try { localStorage.setItem('so-wallet', 'sel:' + id); } catch { /* ignore */ }
  return acc;
}
