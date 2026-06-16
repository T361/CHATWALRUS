// =============================================================================
// Thinkific Orders Sync — enrollment purchase history
// =============================================================================

import { thinkificPaginateFast, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificOrder {
  id: number;
  user_id: number;
  product_id: number;
  product_name: string;
  amount_cents: number;
  coupon_code: string | null;
  status: string;
  created_at: string;
}

export async function syncOrders(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'orders', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('orders', async () => {
    const db = createAdminClient();

    const orders = await thinkificPaginateFast<ThinkificOrder>('/orders');
    console.log(`[SyncOrders] Fetched ${orders.length} orders from Thinkific`);

    // Build lookup: thinkific_user_id → { id, company_id }
    const learnerMap = new Map<string, { id: string; company_id: string | null }>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('learners')
        .select('id, thinkific_user_id, company_id')
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const l of data) {
        if (l.thinkific_user_id) learnerMap.set(l.thinkific_user_id, { id: l.id, company_id: l.company_id });
      }
      if (data.length < 1000) break;
    }

    let count = 0;
    const batchSize = 100;

    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      const rows = batch.map((o) => {
        const learner = learnerMap.get(String(o.user_id));
        return {
          thinkific_order_id: o.id,
          learner_id: learner?.id ?? null,
          company_id: learner?.company_id ?? null,
          product_name: o.product_name ?? null,
          product_id: o.product_id ?? null,
          amount_cents: o.amount_cents ?? 0,
          coupon_code: o.coupon_code ?? null,
          status: o.status ?? null,
          ordered_at: o.created_at ?? null,
        };
      });

      const { error } = await db.from('orders').upsert(rows, { onConflict: 'thinkific_order_id' });
      if (error) console.warn(`[SyncOrders] Batch upsert error:`, error.message);
      else count += rows.length;
    }

    return count;
  });
}
