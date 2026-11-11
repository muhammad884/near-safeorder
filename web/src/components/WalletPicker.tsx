import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { resetWalletStorage, walletOptions } from '../lib/near';
import { useT } from '../lib/i18n';

type W = { id: string; name: string; icon?: string };
type P = { open: boolean; onClose: () => void; onPick: (id: string) => Promise<void> };

export default function WalletPicker({ open, onClose, onPick }: P) {
  const { t } = useT();
  const [list, setList] = useState<W[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const l = walletOptions();
      setList(l);
      if (!l.length && n++ < 20) timer = setTimeout(tick, 500);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  async function choose(id: string) {
    setErr(null); setBusyId(id);
    try { await onPick(id); }
    catch (e) { setErr(t('wp.err', { e: String((e as Error).message || e).slice(0, 200) })); }
    finally { setBusyId(null); }
  }
  function reset() { resetWalletStorage(); try { sessionStorage.clear(); } catch { /* ignore */ } window.location.reload(); }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{t('wp.title')}</p>
          <button onClick={onClose} aria-label={t('wp.close')}><X className="h-5 w-5 text-mute" /></button>
        </div>
        <div className="mt-3 space-y-2">
          {list.length === 0 && <p className="flex items-center gap-2 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />{t('wp.loading')}</p>}
          {list.map((w) => (
            <button key={w.id} disabled={!!busyId} onClick={() => choose(w.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-60">
              {w.icon ? <img src={w.icon} alt="" className="h-7 w-7 rounded-md" /> : <span className="h-7 w-7 rounded-md bg-line" />}
              <span className="flex-1">{w.name}</span>
              {busyId === w.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>
        {err && <p className="mt-3 break-words rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300">{err}</p>}
        <p className="mt-3 text-xs text-mute">{t('wp.hint')}</p>
        <button onClick={reset} className="mt-2 text-xs text-mute underline">{t('wp.reset')}</button>
      </div>
    </div>
  );
}
