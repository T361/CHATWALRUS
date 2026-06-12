// =============================================================================
// Alert Creation (with deduplication)
// =============================================================================

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

export interface CreateAlertInput {
  companyId: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  milestoneDay?: number;
  milestoneCheckId?: string;
}

/**
 * Create an alert with deduplication.
 * Prevents duplicate alerts for the same company, alert_type, and milestone day.
 */
export async function createAlert(input: CreateAlertInput): Promise<string | null> {
  if (!isAdminConfigured()) {
    console.warn('[Alert] Admin client not configured. Alert skipped.');
    return null;
  }

  const db = createAdminClient();

  // Check for existing open alert with same type and company
  const { data: existing } = await db
    .from('alerts')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('alert_type', input.alertType)
    .eq('status', 'open')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`[Alert] Duplicate prevented: ${input.alertType} for company ${input.companyId}`);
    return existing[0].id;
  }

  const { data, error } = await db
    .from('alerts')
    .insert({
      company_id: input.companyId,
      milestone_check_id: input.milestoneCheckId || null,
      alert_type: input.alertType,
      severity: input.severity,
      title: input.title,
      message: input.message,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Alert] Failed to create alert:', error);
    return null;
  }

  console.log(`[Alert] Created: ${input.title}`);
  return data?.id ?? null;
}
