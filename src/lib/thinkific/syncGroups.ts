// =============================================================================
// Thinkific Groups Sync — canonical company registry
// Groups are the authoritative source for companies (115+ groups vs email guesses)
// =============================================================================

import { thinkificPaginate, thinkificGet, isThinkificConfigured } from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSync, type SyncResult } from './syncCore';

interface ThinkificGroup {
  id: number;
  name: string;
  token: string;
  created_at: string;
  updated_at: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function syncGroups(): Promise<SyncResult> {
  if (!isThinkificConfigured()) {
    return { syncType: 'groups', status: 'skipped', recordsProcessed: 0, errorMessage: 'Thinkific not configured' };
  }

  return runSync('groups', async () => {
    const db = createAdminClient();
    let count = 0;

    // ─── 1. Fetch all Thinkific groups ────────────────────────────────────────
    const groups = await thinkificPaginate<ThinkificGroup>('/groups');
    console.log(`[SyncGroups] Fetched ${groups.length} groups from Thinkific`);

    // ─── 2. Upsert companies keyed on thinkific_group_id ─────────────────────
    // This is authoritative — every group becomes/updates a company row.
    // Existing slug-based companies are matched by slug so we don't duplicate.
    const slugMap = new Map<string, { id: string; thinkific_group_id: number | null }>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('companies')
        .select('id, slug, thinkific_group_id')
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const c of data) slugMap.set(c.slug, { id: c.id, thinkific_group_id: c.thinkific_group_id });
      if (data.length < 1000) break;
    }

    for (const group of groups) {
      const slug = toSlug(group.name);
      if (!slug) continue;

      const existing = slugMap.get(slug);

      if (existing) {
        // Update existing company with the group ID if not already set
        if (!existing.thinkific_group_id) {
          await db
            .from('companies')
            .update({
              thinkific_group_id: group.id,
              thinkific_group_token: group.token,
              is_active: true,
            })
            .eq('id', existing.id);
        }
      } else {
        // Create new company from the group
        const { error } = await db.from('companies').upsert(
          {
            name: group.name,
            slug,
            thinkific_group_id: group.id,
            thinkific_group_token: group.token,
            is_active: true,
            learning_timeline_days: 365,
          },
          { onConflict: 'thinkific_group_id' }
        );
        if (error) console.warn(`[SyncGroups] Failed to upsert company for group "${group.name}":`, error.message);
      }
      count++;
    }

    // NOTE: Thinkific's /group_users endpoint is not available on all plans.
    // Learner→company assignment is handled by syncUsers() via custom_profile_fields
    // (the "Company Name" field on each user). Groups are used for canonical company
    // names/slugs only — membership assignment is skipped here.
    const membershipCount = 0;
    console.log(`[SyncGroups] Synced ${count} companies (membership assignment via syncUsers custom fields)`);
    return count + membershipCount;
  });
}

/**
 * Fetch all users in a specific group (for targeted re-assignment).
 */
export async function fetchGroupUsers(groupId: number): Promise<Array<{ user_id: number; group_id: number }>> {
  const memberships = await thinkificGet<{
    items: Array<{ id: number; user_id: number; group_id: number }>;
    meta: { pagination: { total_pages: number } };
  }>('/group_users', { group_id: String(groupId), limit: '100', page: '1' });

  return memberships.items ?? [];
}
