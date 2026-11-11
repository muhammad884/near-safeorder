import type { Status } from '../types';
const map: Record<Status, string> = {
  Created: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  Funded: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  Shipped: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  Disputed: 'bg-red-500/15 text-red-600 dark:text-red-300',
  Releasing: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  Released: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  Refunding: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  Refunded: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  Settling: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  Settled: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
};
export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status]}`}>{status}</span>;
}
