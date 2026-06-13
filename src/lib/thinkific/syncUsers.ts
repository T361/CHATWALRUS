// =============================================================================
// Thinkific Users Sync (Optimized)
// =============================================================================

import { thinkificPaginate, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';
import { buildFullName } from '@/lib/utils/normalize';

interface ThinkificUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  roles: string[];
  last_sign_in_at: string | null;
  custom_profile_fields?: Array<{ label: string; value: string }>;
}

/**
 * Sync users from Thinkific to Supabase.
 * Optimized: pre-loads company slugs, batches upserts, and matches
 * by email domain as a fallback when custom profile fields are empty.
 */
export async function syncUsers(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'users', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('users', async () => {
    const users = await thinkificPaginate<ThinkificUser>('/users');
    const db = createAdminClient();

    // Pre-load all companies for fast lookup
    const { data: allCompanies } = await db
      .from('companies')
      .select('id, name, slug');
    const companyByName = new Map(
      (allCompanies || []).map((c) => [c.name.toLowerCase(), c.id])
    );
    const companyBySlug = new Map(
      (allCompanies || []).map((c) => [c.slug, c.id])
    );

    const genericDomains = new Set([
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'icloud.com', 'thinkific.com', 'live.com', 'aol.com',
    ]);

    let count = 0;
    const batchSize = 50;
    let batch: Array<Record<string, unknown>> = [];

    for (const user of users) {
      // Try to extract company from custom profile fields
      const companyField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('company')
      );

      let companyId: string | null = null;

      // Match by custom field first
      if (companyField?.value) {
        companyId = companyByName.get(companyField.value.toLowerCase()) ?? null;
      }

      // Fallback: match by email domain
      if (!companyId && user.email && user.email.includes('@')) {
        const domain = user.email.split('@')[1].toLowerCase();
        if (!genericDomains.has(domain)) {
          const domainBase = domain.split('.')[0];
          companyId = companyBySlug.get(domainBase) ?? null;
          // Try partial match for compound slugs
          if (!companyId) {
            for (const [slug, id] of companyBySlug) {
              if (slug.includes(domainBase) || domainBase.includes(slug.replace(/-/g, ''))) {
                companyId = id;
                break;
              }
            }
          }
        }
      }

      // Extract department and title from custom fields
      const departmentField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('department')
      );
      const titleField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('title') || f.label.toLowerCase().includes('job')
      );

      batch.push({
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
      });

      // Flush batch
      if (batch.length >= batchSize) {
        const { error } = await db.from('learners').upsert(batch, {
          onConflict: 'thinkific_user_id',
        });
        if (error) console.warn('[SyncUsers] Batch upsert error:', error.message);
        count += batch.length;
        batch = [];
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const { error } = await db.from('learners').upsert(batch, {
        onConflict: 'thinkific_user_id',
      });
      if (error) console.warn('[SyncUsers] Final batch error:', error.message);
      count += batch.length;
    }

    return count;
  });
}
