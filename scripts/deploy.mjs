import fs from 'fs';
import os from 'os';
import * as nearApi from 'near-api-js';
const { Account, JsonRpcProvider, KeyPairSigner, KeyPair } = nearApi;

const ACCOUNT = process.argv[2] || 'safeorder884.testnet';
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const RPC = 'https://test.rpc.fastnear.com';
const KEYFILE = os.homedir() + '/.safeorder-testnet-key.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String((e && e.message) || e).slice(0, 300);

if (!Account || !JsonRpcProvider || !KeyPairSigner || !KeyPair) {
  console.log('API mismatch, exports:', Object.keys(nearApi).join(','));
  process.exit(1);
}

let secret;
if (fs.existsSync(KEYFILE) && JSON.parse(fs.readFileSync(KEYFILE)).accountId === ACCOUNT) {
  secret = JSON.parse(fs.readFileSync(KEYFILE)).secretKey;
  console.log('using saved key for', ACCOUNT);
} else {
  const kp = KeyPair.fromRandom('ed25519');
  secret = kp.toString();
  const res = await fetch('https://helper.nearprotocol.com/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: ACCOUNT, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  console.log('faucet:', res.status, (await res.text()).slice(0, 300));
  if (!res.ok) process.exit(1);
  fs.writeFileSync(KEYFILE, JSON.stringify({ accountId: ACCOUNT, secretKey: secret }), { mode: 0o600 });
}

const provider = new JsonRpcProvider({ url: RPC });
const signer = KeyPairSigner.fromSecretKey(secret);
const account = new Account(ACCOUNT, provider, signer);
const wasm = fs.readFileSync(new URL('../safeorder.wasm', import.meta.url));

let ok = false;
for (let i = 0; i < 6 && !ok; i++) {
  try {
    await account.deployContract(wasm);
    ok = true;
    console.log('deployed');
  } catch (e) {
    console.log('deploy retry', i, msg(e));
    await sleep(4000);
  }
}
if (!ok) process.exit(1);

try {
  await account.callFunction({
    contractId: ACCOUNT,
    methodName: 'new',
    args: { usdc_contract: USDC },
    gas: 100_000_000_000_000n,
    deposit: 0n,
  });
  console.log('initialized');
} catch (e) {
  console.log('init:', msg(e));
}

const rr = await (await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'optimistic', account_id: ACCOUNT, method_name: 'get_usdc_contract', args_base64: Buffer.from('{}').toString('base64') } }) })).json();
const v = Buffer.from(rr.result.result).toString();
console.log('get_usdc_contract ->', v);
console.log('CONTRACT:', ACCOUNT);
