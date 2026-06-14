// =============================================================================
// Thinkific Sync Core (shared sync utilities)
// =============================================================================

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

export interface SyncResult {
  syncType: string;
  status: 'success' | 'error' | 'skipped';
  recordsProcessed: number;
  errorMessage?: string;
  logId?: string;
}

export type SyncSummaryStatus = 'success' | 'partial' | 'skipped' | 'failed';

export interface SyncSummary {
  status: SyncSummaryStatus;
  message: string;
  recordsProcessed: number;
}

export function summarizeSyncResults(results: Record<string, SyncResult>): SyncSummary {
  const values = Object.values(results);
  const recordsProcessed = values.reduce((sum, result) => sum + result.recordsProcessed, 0);

  if (values.length === 0) {
    return {
      status: 'skipped',
      message: 'No sync operations were run.',
      recordsProcessed,
    };
  }

  const successCount = values.filter((result) => result.status === 'success').length;
  const skippedCount = values.filter((result) => result.status === 'skipped').length;
  const errorCount = values.filter((result) => result.status === 'error').length;

  if (successCount === values.length) {
    return {
      status: 'success',
      message: 'All sync operations completed successfully.',
      recordsProcessed,
    };
  }

  if (skippedCount === values.length) {
    return {
      status: 'skipped',
      message: 'All sync operations were skipped.',
      recordsProcessed,
    };
  }

  if (errorCount === values.length) {
    return {
      status: 'failed',
      message: 'All sync operations failed.',
      recordsProcessed,
    };
  }

  return {
    status: 'partial',
    message: 'Some sync operations completed, skipped, or failed. See results for details.',
    recordsProcessed,
  };
}

/**
 * Create a sync log entry in the database.
 */
export async function createSyncLog(
  syncType: string,
  status: string,
  recordsProcessed: number = 0,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  if (!isAdminConfigured()) {
    console.warn('[SyncLog] Admin client not configured. Log skipped.');
    return null;
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('sync_logs')
    .insert({
      sync_type: syncType,
      status,
      started_at: now,
      completed_at: status !== 'running' ? now : null,
      records_processed: recordsProcessed,
      error_message: errorMessage || null,
      metadata: metadata || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SyncLog] Failed to create log:', error);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Update a sync log entry status.
 */
export async function updateSyncLog(
  logId: string,
  updates: {
    status?: string;
    records_processed?: number;
    error_message?: string;
    completed_at?: string;
  }
): Promise<void> {
  if (!isAdminConfigured()) return;

  const db = createAdminClient();
  await db
    .from('sync_logs')
    .update({
      ...updates,
      completed_at: updates.completed_at || new Date().toISOString(),
    })
    .eq('id', logId);
}

/**
 * Run a sync operation with automatic logging.
 */
export async function runSync(
  syncType: string,
  operation: () => Promise<number>
): Promise<SyncResult> {
  const logId = await createSyncLog(syncType, 'running');

  try {
    const recordsProcessed = await operation();

    if (logId) {
      await updateSyncLog(logId, {
        status: 'success',
        records_processed: recordsProcessed,
      });
    }

    return {
      syncType,
      status: 'success',
      recordsProcessed,
      logId: logId ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (logId) {
      await updateSyncLog(logId, {
        status: 'error',
        error_message: errorMessage,
      });
    }

    return {
      syncType,
      status: 'error',
      recordsProcessed: 0,
      errorMessage,
      logId: logId ?? undefined,
    };
  }
}
