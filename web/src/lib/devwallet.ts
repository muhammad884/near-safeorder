import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { RPC_URL } from './config';

// TESTNET ONLY. The private key lives in memory for this tab and is never stored.
let session: { accountId: string; account: Account } | null = null;
export const devSession = () => session;
export const stopDev = () => { session = null; };
export function startDev(accountId: string, secret: string) {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const signer = KeyPairSigner.fromSecretKey(secret as any);
  session = { accountId, account: new Account(accountId, provider, signer) };
}
export const publicKeyOf = (secret: string): string =>
  (KeyPair.fromString(secret as any) as any).getPublicKey().toString();

export async function devSend(txs: any[]): Promise<string[]> {
  if (!session) throw new Error('No dev session');
  const acc: any = session.account;
  const hashes: string[] = [];
  for (const tx of txs) {
    for (const a of tx.actions) {
      const p = {
        contractId: tx.receiverId, methodName: a.params.methodName, args: a.params.args,
        gas: BigInt(a.params.gas), deposit: BigInt(a.params.deposit),
      };
      if (typeof acc.callFunctionRaw === 'function') {
        const out = await acc.callFunctionRaw(p);
        const st = out?.status;
        if (st && typeof st === 'object' && 'Failure' in st) throw new Error(JSON.stringify(st.Failure));
        const h = out?.transaction?.hash ?? out?.transaction_outcome?.id;
        if (h) hashes.push(h);
      } else {
        await acc.callFunction(p);
      }
    }
  }
  return hashes;
}
