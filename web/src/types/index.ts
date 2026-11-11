export type Token = 'Near' | 'Usdc';
export type Status = 'Created' | 'Funded' | 'Shipped' | 'Disputed' | 'Releasing' | 'Released' | 'Refunding' | 'Refunded' | 'Settling' | 'Settled';
export type Page = 'overview' | 'create' | 'orders' | 'pay';
export interface Proposal { by: string; buyer_amount: string; note: string }
export interface Order {
  id: number; buyer: string | null; seller: string; description: string; amount: string;
  token: Token; created_at: string; ship_window_hours: number; ship_deadline: string | null; status: Status;
  proposal: Proposal | null; owed_buyer: string; owed_seller: string; pending_legs: number;
}
export type RunFn = (label: string, fn: () => Promise<string[]>, orderId?: number) => Promise<boolean>;
