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

interface ThinkificGroupMembership {
  id: number;
  user_id: number;
  group_id: number;
  created_at: string;
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

    // ─── 3. Sync group memberships → update learner.company_id ───────────────
    // Reload company map after potential inserts
    const companyByGroupId = new Map<number, string>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('companies')
        .select('id, thinkific_group_id')
        .not('thinkific_group_id', 'is', null)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const c of data) {
        if (c.thinkific_group_id) companyByGroupId.set(c.thinkific_group_id, c.id);
      }
      if (data.length < 1000) break;
    }

    // Load all learners by thinkific_user_id for fast lookup
    const learnerByThinkificId = new Map<string, { id: string; company_id: string | null }>();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('learners')
        .select('id, thinkific_user_id, company_id')
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const l of data) {
        if (l.thinkific_user_id) learnerByThinkificId.set(l.thinkific_user_id, { id: l.id, company_id: l.company_id });
      }
      if (data.length < 1000) break;
    }

    // Fetch memberships for each group and update learner company assignments
    let membershipCount = 0;
    for (const group of groups) {
      const companyId = companyByGroupId.get(group.id);
      if (!companyId) continue;

      try {
        const memberships = await thinkificPaginate<ThinkificGroupMembership>(
          `/group_users`,
          { group_id: String(group.id) }
        );

        const updates: Array<{ id: string; company_id: string }> = [];
        for (const m of memberships) {
          const learner = learnerByThinkificId.get(String(m.user_id));
          if (learner && learner.company_id !== companyId) {
            updates.push({ id: learner.id, company_id: companyId });
          }
        }

        // Batch update in groups of 50
        for (let i = 0; i < updates.length; i += 50) {
          const batch = updates.slice(i, i + 50);
          for (const u of batch) {
            await db
              .from('learners')
              .update({ company_id: u.company_id })
              .eq('id', u.id);
          }
          membershipCount += batch.length;
        }
      } catch (err) {
        console.warn(`[SyncGroups] Failed to fetch memberships for group ${group.id} (${group.name}):`, err);
      }
    }

    console.log(`[SyncGroups] Synced ${count} companies, updated ${membershipCount} learner→company assignments`);
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
