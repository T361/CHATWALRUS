// =============================================================================
// Gamification — Daily Leaderboard Snapshot
// Takes a point-in-time snapshot of global + company ranks for trend tracking.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';

export async function snapshotLeaderboard(): Promise<number> {
  const db = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  let count = 0;

  // Load current learner_points (fully calculated before calling this)
  const allPoints: Array<{
    learner_id: string; company_id: string | null; total_points: number;
  }> = [];

  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learner_points')
      .select('learner_id, company_id, total_points')
      .order('total_points', { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allPoints.push(...data);
    if (data.length < 1000) break;
  }

  if (allPoints.length === 0) return 0;

  // Compute global ranks (1-indexed, ties get same rank)
  const globalRanks = new Map<string, number>();
  let rank = 1;
  let prev = -1;
  let sameRankCount = 0;
  for (const p of allPoints) {
    if (p.total_points !== prev) {
      rank += sameRankCount;
      sameRankCount = 1;
    } else {
      sameRankCount++;
    }
    globalRanks.set(p.learner_id, rank);
    prev = p.total_points;
  }

  // Compute company ranks per company
  const byCompany = new Map<string, typeof allPoints>();
  for (const p of allPoints) {
    const co = p.company_id ?? 'none';
    if (!byCompany.has(co)) byCompany.set(co, []);
    byCompany.get(co)!.push(p);
  }

  const companyRanks = new Map<string, number>();
  for (const members of byCompany.values()) {
    let cr = 1;
    let cprev = -1;
    let csameCount = 0;
    for (const p of members) {
      if (p.total_points !== cprev) {
        cr += csameCount;
        csameCount = 1;
      } else {
        csameCount++;
      }
      companyRanks.set(p.learner_id, cr);
      cprev = p.total_points;
    }
  }

  // Load yesterday's snapshot for rank delta
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toISOString().split('T')[0];

  const prevRanks = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('leaderboard_snapshots')
      .select('learner_id, global_rank')
      .eq('snapshot_date', yDate)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) prevRanks.set(r.learner_id, r.global_rank ?? 0);
    if (data.length < 1000) break;
  }

  // Build snapshot rows
  const rows = allPoints.map((p) => ({
    learner_id: p.learner_id,
    company_id: p.company_id,
    snapshot_date: today,
    total_points: p.total_points,
    global_rank: globalRanks.get(p.learner_id) ?? null,
    company_rank: companyRanks.get(p.learner_id) ?? null,
    prev_global_rank: prevRanks.get(p.learner_id) ?? null,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db
      .from('leaderboard_snapshots')
      .upsert(rows.slice(i, i + 100), { onConflict: 'learner_id,snapshot_date' });
    if (error) console.warn('[Leaderboard] Snapshot upsert error:', error.message);
    else count += Math.min(100, rows.length - i);
  }

  return count;
}
