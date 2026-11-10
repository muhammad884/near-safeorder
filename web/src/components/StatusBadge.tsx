import type { Status } from '../types';
const map: Record<Status, string> = {
  Created: 'bg-slate-500/20 text-slate-300', Funded: 'bg-sky-500/20 text-sky-300', Shipped: 'bg-amber-500/20 text-amber-300',
  Disputed: 'bg-red-500/20 text-red-300', Releasing: 'bg-violet-500/20 text-violet-300', Released: 'bg-emerald-500/20 text-emerald-300',
  Refunding: 'bg-violet-500/20 text-violet-300', Refunded: 'bg-teal-500/20 text-teal-300',
};
export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status]}`}>{status}</span>;
}
