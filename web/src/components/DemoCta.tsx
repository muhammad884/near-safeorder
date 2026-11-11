import { Loader2 } from 'lucide-react';
import { useT } from '../lib/i18n';

export default function DemoCta({ onStart, busy, err }: { onStart: () => void; busy: boolean; err: string | null }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-near/40 bg-near/10 p-4 text-sm">
      <p className="font-semibold">{t('dm.title')}</p>
      <p className="mt-1 text-xs text-mute">{t('dm.sub')}</p>
      <button onClick={onStart} disabled={busy} className="mt-3 flex items-center gap-2 rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? t('dm.creating') : t('dm.start')}
      </button>
      {err && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{err}</p>}
    </div>
  );
}
