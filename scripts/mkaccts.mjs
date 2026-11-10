import * as nearApi from 'near-api-js';
const { KeyPair } = nearApi;
for (const role of ['buyer', 'seller']) {
  const id = `so${role}-${Date.now().toString(36)}.testnet`;
  const kp = KeyPair.fromRandom('ed25519');
  const res = await fetch('https://helper.nearprotocol.com/account', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  console.log(`\n${role.toUpperCase()}: ${id}  (faucet ${res.status})\nPRIVATE KEY: ${kp.toString()}`);
  await new Promise((r) => setTimeout(r, 1500));
}
