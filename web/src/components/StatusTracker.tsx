import { Check } from 'lucide-react';
import { useT } from '../lib/i18n';
import type { Status } from '../types';

const stage: Record<Status, number> = { Created: 0, Funded: 1, Shipped: 2, Disputed: 2, Releasing: 3, Refunding: 3, Settling: 3, Released: 4, Refunded: 4, Settled: 4 };
const finalKey: Partial<Record<Status, string>> = { Released: 'trk.released', Refunded: 'trk.refunded', Settled: 'trk.settled' };

export default function StatusTracker({ status }: { status: Status }) {
  const { t } = useT();
  const cur = stage[status];
  const bad = status === 'Disputed';
  const labels = [t('trk.created'), t('trk.funded'), t('trk.shipped'), t(finalKey[status] ?? 'trk.done')];
  return (
    <div className="mt-4 flex items-start">
      {labels.map((l, i) => {
        const done = cur === 4 || i < cur;
        const active = !done && i === cur;
        const circle = done ? 'bg-near text-onnear' : active ? (bad ? 'border-2 border-red-500' : 'border-2 border-near') : 'border border-line';
        return (
          <div key={i} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-14 flex-col items-center">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${circle}`}>{done && <Check className="h-3.5 w-3.5" />}</span>
              <span className={`mt-1 text-center text-[10px] leading-tight ${active || done ? 'text-ink' : 'text-mute'}`}>{l}</span>
            </div>
            {i < 3 && <span className={`mt-3 h-0.5 flex-1 ${done ? 'bg-near' : 'bg-line'}`} />}
          </div>
        );
      })}
    </div>
  );
}
