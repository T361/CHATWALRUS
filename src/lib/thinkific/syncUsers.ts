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

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sync users from Thinkific to Supabase.
 * Auto-creates companies from custom profile fields or email domains
 * when no matching company exists — this is how the full 130+ company
 * set gets populated from an initial state with only a few manual rows.
 */
export async function syncUsers(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'users', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('users', async () => {
    const users = await thinkificPaginate<ThinkificUser>('/users');
    const db = createAdminClient();

    // Pre-load all companies for fast lookup
    const loadCompanies = async () => {
      const { data } = await db.from('companies').select('id, name, slug');
      const byName = new Map((data || []).map((c) => [c.name.toLowerCase(), c.id]));
      const bySlug = new Map((data || []).map((c) => [c.slug, c.id]));
      return { byName, bySlug };
    };

    let { byName: companyByName, bySlug: companyBySlug } = await loadCompanies();

    const genericDomains = new Set([
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'icloud.com', 'thinkific.com', 'live.com', 'aol.com',
    ]);

    // -------------------------------------------------------------------------
    // Pass 1: collect unique company identifiers not yet in the DB
    // -------------------------------------------------------------------------
    // slug → display name (first occurrence wins as canonical name)
    const companiesToCreate = new Map<string, string>();

    for (const user of users) {
      const companyField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('company')
      );

      let matched = false;

      if (companyField?.value) {
        const nameKey = companyField.value.trim().toLowerCase();
        const slug = toSlug(companyField.value);
        if (companyByName.has(nameKey) || companyBySlug.has(slug)) {
          matched = true;
        } else if (slug) {
          if (!companiesToCreate.has(slug)) {
            companiesToCreate.set(slug, companyField.value.trim());
          }
          matched = true; // will be created
        }
      }

      if (!matched && user.email?.includes('@')) {
        const domain = user.email.split('@')[1].toLowerCase();
        if (!genericDomains.has(domain)) {
          const domainBase = domain.split('.')[0];
          const slug = toSlug(domainBase);
          if (!companyBySlug.has(slug)) {
            // Try partial match against existing slugs
            let partialMatch = false;
            for (const [existingSlug] of companyBySlug) {
              if (existingSlug.includes(slug) || slug.includes(existingSlug.replace(/-/g, ''))) {
                partialMatch = true;
                break;
              }
            }
            if (!partialMatch && !companiesToCreate.has(slug)) {
              const name = domainBase.charAt(0).toUpperCase() + domainBase.slice(1);
              companiesToCreate.set(slug, name);
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Batch-create new companies
    // -------------------------------------------------------------------------
    if (companiesToCreate.size > 0) {
      console.log(`[SyncUsers] Auto-creating ${companiesToCreate.size} new companies`);
      const newCompanyRows = Array.from(companiesToCreate.entries()).map(([slug, name]) => ({
        name,
        slug,
        is_active: true,
        learning_timeline_days: 365,
      }));

      // Upsert in batches of 50 to avoid request size limits
      for (let i = 0; i < newCompanyRows.length; i += 50) {
        const { error } = await db.from('companies').upsert(
          newCompanyRows.slice(i, i + 50),
          { onConflict: 'slug', ignoreDuplicates: true }
        );
        if (error) console.warn('[SyncUsers] Company upsert error:', error.message);
      }

      // Reload maps so Pass 2 sees the new company IDs
      ({ byName: companyByName, bySlug: companyBySlug } = await loadCompanies());
      console.log(`[SyncUsers] Company maps refreshed — ${companyBySlug.size} total companies`);
    }

    // -------------------------------------------------------------------------
    // Pass 2: upsert learners with resolved company IDs
    // -------------------------------------------------------------------------
    let count = 0;
    const batchSize = 50;
    let batch: Array<Record<string, unknown>> = [];

    for (const user of users) {
      const companyField = user.custom_profile_fields?.find(
        (f) => f.label.toLowerCase().includes('company')
      );

      let companyId: string | null = null;

      // Match by custom field first
      if (companyField?.value) {
        const nameKey = companyField.value.trim().toLowerCase();
        const slug = toSlug(companyField.value);
        companyId = companyByName.get(nameKey) ?? companyBySlug.get(slug) ?? null;
      }

      // Fallback: match by email domain
      if (!companyId && user.email?.includes('@')) {
        const domain = user.email.split('@')[1].toLowerCase();
        if (!genericDomains.has(domain)) {
          const domainBase = domain.split('.')[0];
          const slug = toSlug(domainBase);
          companyId = companyBySlug.get(slug) ?? null;
          if (!companyId) {
            for (const [existingSlug, id] of companyBySlug) {
              if (existingSlug.includes(slug) || slug.includes(existingSlug.replace(/-/g, ''))) {
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
