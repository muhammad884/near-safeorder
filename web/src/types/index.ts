export type Token = 'Near' | 'Usdc';
export type Status = 'Created' | 'Funded' | 'Shipped' | 'Disputed' | 'Releasing' | 'Released' | 'Refunding' | 'Refunded';
export type Page = 'overview' | 'create' | 'orders';
export interface Order {
  id: number; buyer: string; seller: string; description: string; amount: string;
  token: Token; created_at: string; ship_window_hours: number; ship_deadline: string | null; status: Status;
}
export type RunFn = (label: string, fn: () => Promise<string[]>, orderId?: number) => Promise<boolean>;
