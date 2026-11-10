const KEY = 'safeorder:tx:v1';
export type TxEntry = { label: string; hash: string };
function load(): Record<string, TxEntry[]> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
export function saveTx(id: number, label: string, hash: string) {
  try {
    const d = load();
    if (!d[id]) d[id] = [];
    d[id].push({ label, hash });
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* storage unavailable */ }
}
export function getTxs(id: number): TxEntry[] { return load()[id] || []; }
