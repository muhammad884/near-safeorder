import { ShieldCheck, PackageCheck, Truck, Wallet, ExternalLink } from 'lucide-react';
import { CONTRACT_ID, USDC_ID, EXPLORER } from '../lib/config';
import { useT } from '../lib/i18n';
import type { Order, Page } from '../types';

type P = { account: string | null; orders: Order[]; total: number | null; onNav: (p: Page) => void; onConnect: () => void };

export default function Overview({ account, orders, total, onNav, onConnect }: P) {
  const { t } = useT();
  const active = orders.filter((o) => ['Funded', 'Shipped', 'Disputed', 'Releasing', 'Refunding', 'Settling'].includes(o.status)).length;
  const done = orders.filter((o) => o.status === 'Released' || o.status === 'Settled').length;
  const refunded = orders.filter((o) => o.status === 'Refunded').length;
  const steps = [
    { icon: Wallet, t: t('ov.st1t'), d: t('ov.st1d') },
    { icon: Truck, t: t('ov.st2t'), d: t('ov.st2d') },
    { icon: PackageCheck, t: t('ov.st3t'), d: t('ov.st3d') },
  ];
  const btn = 'rounded-lg bg-near px-4 py-2.5 font-semibold text-onnear';
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-6">
        <ShieldCheck className="h-9 w-9 text-near" />
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{t('ov.title')}</h1>
        <p className="mt-2 max-w-2xl text-mute">{t('ov.sub')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {account ? <button onClick={() => onNav('create')} className={btn}>{t('ov.create')}</button>
            : <button onClick={onConnect} className={btn}>{t('connect')}</button>}
          {account && <button onClick={() => onNav('orders')} className="rounded-lg border border-line px-4 py-2.5 font-semibold">{t('ov.myorders')}</button>}
        </div>
      </section>
      {account && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[t('ov.s1'), orders.length], [t('ov.s2'), active], [t('ov.s3'), done], [t('ov.s4'), refunded]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-line bg-card p-4"><p className="text-xs text-mute">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
          ))}
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: I, t: title, d }) => (
          <div key={title} className="rounded-xl border border-line bg-card p-4"><I className="h-5 w-5 text-near" /><p className="mt-2 font-semibold">{title}</p><p className="mt-1 text-sm text-mute">{d}</p></div>
        ))}
      </section>
      <section className="rounded-2xl border border-line bg-card p-5 text-sm">
        <h2 className="font-semibold">{t('ov.rt')}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-mute">
          <li>{t('ov.r1')}</li><li>{t('ov.r2')}</li><li>{t('ov.r3')}</li><li>{t('ov.r4')}</li>
        </ul>
      </section>
      <section className="rounded-2xl border border-line bg-card p-5 text-xs text-mute">
        <p>{t('ov.net')}{total !== null ? t('ov.count', { n: total }) : ''}</p>
        <a className="mt-1 flex items-center gap-1 break-all hover:text-near" href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 shrink-0" />{t('ov.contract')}: {CONTRACT_ID}</a>
        <a className="mt-1 flex items-center gap-1 break-all hover:text-near" href={`${EXPLORER}/address/${USDC_ID}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 shrink-0" />{t('ov.usdc')}: {USDC_ID}</a>
      </section>
    </div>
  );
}
