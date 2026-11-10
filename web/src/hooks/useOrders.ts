import { useCallback, useEffect, useState } from 'react';
import { fetchOrders, view } from '../lib/near';
import { CONTRACT_ID } from '../lib/config';
import type { Order } from '../types';

export function useOrders(account: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setTotal(await view<number>(CONTRACT_ID, 'get_total_orders'));
      setOrders(account ? await fetchOrders(account) : []);
      setError(null);
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setLoading(false); }
  }, [account]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);
  const refreshSoon = useCallback(async () => { await refresh(); setTimeout(refresh, 3000); setTimeout(refresh, 8000); }, [refresh]);
  return { orders, total, loading, error, refresh, refreshSoon };
}
