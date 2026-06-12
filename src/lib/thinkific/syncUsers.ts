// =============================================================================
// Thinkific Users Sync
// =============================================================================

import { thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { buildFullName } from '@/lib/utils/normalize';

interface ThinkificUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  roles?: string[];
  last_sign_in_at?: string;
  created_at: string;
  // Custom fields for company assignment
  custom_profile_fields?: Array<{
    label: string;
    value: string;
  }>;
  company?: string;
  // TODO: Actual Thinkific field for company grouping may vary.
  // Could be group_id, custom field, or enrollment metadata.
}

/**
 * Sync users from Thinkific to Supabase.
 */
export async function syncUsers(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'users', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('users', async () => {
    const users = await thinkificPaginate<ThinkificUser>('/users');
    const db = createAdminClient();
    let count = 0;

    for (const user of users) {
      // Try to extract company from custom profile fields
      const companyField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('company')
      );

      // Look up company by name if field exists
      let companyId: string | null = null;
      if (companyField?.value) {
        const { data: company } = await db
          .from('companies')
          .select('id')
          .ilike('name', companyField.value)
          .limit(1)
          .single();
        companyId = company?.id ?? null;
      }

      // Extract department and title from custom fields
      const departmentField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('department')
      );
      const titleField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('title') || f.label.toLowerCase().includes('job')
      );

      await db.from('learners').upsert(
        {
          thinkific_user_id: String(user.id),
          company_id: companyId,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
          full_name: buildFullName(user.first_name, user.last_name),
          email: user.email || null,
          department: departmentField?.value || null,
          title: titleField?.value || null,
          role: user.roles?.[0] || null,
          last_login_at: user.last_sign_in_at || null,
          is_active: true,
        },
        { onConflict: 'thinkific_user_id' }
      );
      count++;
    }

    return count;
  });
}
