import type { Demo, Role } from '../hooks/useWallet';

export default function DemoBar({ demo, onSwitch, onExit }: { demo: Demo; onSwitch: (r: Role) => void; onExit: () => void }) {
  const me = demo[demo.role];
  return (
    <div className="border-b border-line bg-near/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2 text-xs">
        <span className="font-semibold text-near">DEMO (testnet)</span>
        <span className="text-mute">Acting as</span>
        {(['buyer', 'seller'] as const).map((r) => (
          <button key={r} onClick={() => onSwitch(r)}
            className={`rounded-md px-2.5 py-1 font-semibold ${demo.role === r ? 'bg-near text-onnear' : 'border border-line text-mute'}`}>{r === 'buyer' ? 'Buyer' : 'Seller'}</button>
        ))}
        <span className="max-w-full truncate text-mute">{me.id}</span>
        <button onClick={onExit} className="ml-auto text-mute underline">Exit demo</button>
      </div>
    </div>
  );
}
