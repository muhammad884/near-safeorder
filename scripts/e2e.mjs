import * as nearApi from 'near-api-js';
const { Account, JsonRpcProvider, KeyPairSigner, KeyPair } = nearApi;

const CONTRACT = process.argv[2] || 'safeorder884.testnet';
const RPC = 'https://test.rpc.fastnear.com';
const provider = new JsonRpcProvider({ url: RPC });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String((e && e.message) || e).slice(0, 250);
const NEAR = 10n ** 24n;

async function rpc(params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'query', params }),
  });
  const j = await r.json();
  if (j.error || (j.result && j.result.error)) throw new Error(JSON.stringify(j.error || j.result.error).slice(0, 250));
  return j.result;
}
async function view(method, args = {}) {
  const res = await rpc({
    request_type: 'call_function', finality: 'optimistic', account_id: CONTRACT,
    method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(res.result).toString());
}
async function balance(id) {
  const res = await rpc({ request_type: 'view_account', finality: 'optimistic', account_id: id });
  return BigInt(res.amount);
}
async function makeAccount(prefix) {
  const id = `${prefix}-${Date.now().toString(36)}.testnet`;
  const kp = KeyPair.fromRandom('ed25519');
  const res = await fetch('https://helper.nearprotocol.com/account', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error('faucet failed ' + res.status);
  await sleep(4000);
  return { id, acc: new Account(id, provider, KeyPairSigner.fromSecretKey(kp.toString())) };
}
const call = (a, methodName, args, deposit = 0n) =>
  a.acc.callFunction({ contractId: CONTRACT, methodName, args, gas: 100_000_000_000_000n, deposit });

console.log('usdc:', await view('get_usdc_contract'));
const buyer = await makeAccount('sob-buyer');
const seller = await makeAccount('sob-seller');
console.log('buyer :', buyer.id, '\nseller:', seller.id);

await call(buyer, 'create_order', { seller: seller.id, description: 'E2E test phone', amount: (1n * NEAR).toString(), token: 'Near', ship_window_hours: 24 }, NEAR / 100n);
const id = await view('get_total_orders');
console.log('1 created order', id, (await view('get_order', { order_id: id })).status);

await call(buyer, 'pay_near', { order_id: id }, 1n * NEAR);
console.log('2 paid ->', (await view('get_order', { order_id: id })).status);

await call(seller, 'mark_shipped', { order_id: id });
console.log('3 shipped ->', (await view('get_order', { order_id: id })).status);

try { await call(seller, 'confirm_delivery', { order_id: id }); console.log('!! SECURITY BUG: seller confirmed'); }
catch (e) { console.log('4 seller confirm rejected (expected):', msg(e)); }

const before = await balance(seller.id);
await call(buyer, 'confirm_delivery', { order_id: id });
await sleep(6000);
const o = await view('get_order', { order_id: id });
const after = await balance(seller.id);
console.log('5 confirmed ->', o.status);
console.log('seller received (NEAR):', Number((after - before) / 10n ** 20n) / 10000);

try { await call(buyer, 'confirm_delivery', { order_id: id }); console.log('!! DOUBLE RELEASE BUG'); }
catch (e) { console.log('6 double release rejected (expected):', msg(e)); }
