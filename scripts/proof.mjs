import fs from 'fs';
import * as nearApi from 'near-api-js';
const { Account, JsonRpcProvider, KeyPairSigner, KeyPair } = nearApi;
const CONTRACT = fs.readFileSync(process.env.HOME + '/w/contract_id_v3.txt', 'utf8').trim();
const RPC = 'https://test.rpc.fastnear.com';
const provider = new JsonRpcProvider({ url: RPC });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEAR = 10n ** 24n;
const fmt = (x) => (Number(x / 10n ** 18n) / 1e6).toFixed(4);
async function rpc(params) {
  const j = await (await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params }) })).json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error || j.result.error).slice(0, 200));
  return j.result;
}
const view = async (m, args = {}) => JSON.parse(Buffer.from((await rpc({ request_type: 'call_function', finality: 'optimistic', account_id: CONTRACT, method_name: m, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') })).result).toString());
const bal = async (id) => BigInt((await rpc({ request_type: 'view_account', finality: 'optimistic', account_id: id })).amount);
async function mk(p) {
  const id = `${p}-${Date.now().toString(36)}.testnet`;
  const kp = KeyPair.fromRandom('ed25519');
  const r = await fetch('https://helper.nearprotocol.com/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!r.ok) throw new Error('faucet ' + r.status);
  await sleep(4000);
  return { id, acc: new Account(id, provider, KeyPairSigner.fromSecretKey(kp.toString())) };
}
const call = (a, m, args, dep = 0n) => a.acc.callFunction({ contractId: CONTRACT, methodName: m, args, gas: 100_000_000_000_000n, deposit: dep });
async function shipped(buyer, seller, amt) {
  await call(seller, 'create_invoice', { description: 'proof', amount: amt.toString(), token: 'Near', ship_window_hours: 24, buyer: null }, NEAR / 100n);
  const id = await view('get_total_orders');
  await call(buyer, 'pay_near', { order_id: id }, amt);
  await call(seller, 'mark_shipped', { order_id: id });
  return id;
}
console.log('contract:', CONTRACT);
const buyer = await mk('pb'), seller = await mk('ps');

// A: negotiated settlement, buyer gets 0.1 of 0.3
let id = await shipped(buyer, seller, 3n * NEAR / 10n);
await call(buyer, 'open_dispute', { order_id: id });
await call(buyer, 'propose_settlement', { order_id: id, buyer_amount: (NEAR / 10n).toString(), note: 'half-ish' });
await sleep(8000);
const b0 = await bal(buyer.id), s0 = await bal(seller.id);
try { await call(seller, 'accept_settlement', { order_id: id, buyer_amount: (NEAR / 20n).toString() }); console.log('!! BUG: wrong-amount accept succeeded'); } catch { console.log('A swapped accept rejected (expected)'); }
await call(seller, 'accept_settlement', { order_id: id, buyer_amount: (NEAR / 10n).toString() });
await sleep(10000);
const b1 = await bal(buyer.id), s1 = await bal(seller.id);
console.log('A status:', (await view('get_order', { order_id: id })).status);
console.log('A buyer delta (expect +0.1000):', fmt(b1 - b0));
console.log('A seller delta (expect about +0.2000 minus gas):', fmt(s1 - s0));

// B: plain release, wait for gas refunds before measuring
id = await shipped(buyer, seller, 3n * NEAR / 10n);
try { await call(seller, 'confirm_delivery', { order_id: id }); console.log('!! BUG'); } catch { console.log('B seller confirm rejected (expected)'); }
await sleep(12000);
const s2 = await bal(seller.id);
await call(buyer, 'confirm_delivery', { order_id: id });
await sleep(10000);
const s3 = await bal(seller.id);
console.log('B status:', (await view('get_order', { order_id: id })).status);
console.log('B seller delta (expect +0.3000):', fmt(s3 - s2));
