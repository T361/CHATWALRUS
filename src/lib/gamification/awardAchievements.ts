// =============================================================================
// Gamification — Achievement Engine
// Checks each learner's stats against achievement criteria and awards badges.
// Idempotent via UNIQUE(learner_id, achievement_slug).
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';

interface Achievement {
  slug: string;
  criteria_type: string;
  criteria_value: number;
  bonus_points: number;
}

interface LearnerPoints {
  learner_id: string;
  company_id: string | null;
  sessions_attended: number;
  total_points: number;
  current_streak_days: number;
  longest_streak_days: number;
  survey_points: number;
}

export async function awardAchievements(): Promise<number> {
  const db = createAdminClient();
  let awarded = 0;

  // Load all achievement definitions
  const { data: achievements, error: achErr } = await db
    .from('achievements')
    .select('slug, criteria_type, criteria_value, bonus_points');
  if (achErr || !achievements) {
    console.warn('[Achievements] Failed to load achievements:', achErr?.message);
    return 0;
  }

  // Load already-earned achievements so we don't re-check them
  const earned = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learner_achievements')
      .select('learner_id, achievement_slug')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const e of data) earned.add(`${e.learner_id}:${e.achievement_slug}`);
    if (data.length < 1000) break;
  }

  // Load learner points stats for threshold checks
  const pointsMap = new Map<string, LearnerPoints>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learner_points')
      .select('learner_id, company_id, sessions_attended, total_points, current_streak_days, longest_streak_days, survey_points')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const p of data) pointsMap.set(p.learner_id, p as LearnerPoints);
    if (data.length < 1000) break;
  }

  // Count completed courses per learner
  const courseCompletions = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('enrollments')
      .select('learner_id')
      .eq('is_completed', true)
      .not('learner_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.learner_id) courseCompletions.set(r.learner_id, (courseCompletions.get(r.learner_id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }

  // Count quiz passes per learner
  const quizPasses = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('quizzes')
      .select('learner_id')
      .not('learner_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.learner_id) quizPasses.set(r.learner_id, (quizPasses.get(r.learner_id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }

  // Count survey submissions per learner
  const surveyCounts = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('surveys')
      .select('learner_id')
      .not('learner_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.learner_id) surveyCounts.set(r.learner_id, (surveyCounts.get(r.learner_id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }

  // Check each learner against each achievement
  const toInsert: Array<{ learner_id: string; company_id: string | null; achievement_slug: string; earned_at: string }> = [];
  const bonusEvents: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();

  for (const [learnerId, pts] of pointsMap) {
    for (const ach of achievements as Achievement[]) {
      if (earned.has(`${learnerId}:${ach.slug}`)) continue;

      let qualifies = false;

      switch (ach.criteria_type) {
        case 'zoom_sessions':
          qualifies = pts.sessions_attended >= ach.criteria_value;
          break;
        case 'courses_complete':
          qualifies = (courseCompletions.get(learnerId) ?? 0) >= ach.criteria_value;
          break;
        case 'lessons_complete':
          // Proxy: any lesson completion in points events
          qualifies = pts.total_points > 0;
          break;
        case 'quiz_passes':
          qualifies = (quizPasses.get(learnerId) ?? 0) >= ach.criteria_value;
          break;
        case 'streak_days':
          qualifies = pts.longest_streak_days >= ach.criteria_value;
          break;
        case 'surveys_submitted':
          qualifies = (surveyCounts.get(learnerId) ?? 0) >= ach.criteria_value;
          break;
        // 'rank_global', 'benchmark_120', 'onpace_streak', 'perfect_quiz' — handled by milestone/leaderboard checks
        default:
          continue;
      }

      if (qualifies) {
        toInsert.push({ learner_id: learnerId, company_id: pts.company_id, achievement_slug: ach.slug, earned_at: now });
        if (ach.bonus_points > 0) {
          bonusEvents.push({
            learner_id: learnerId,
            company_id: pts.company_id,
            event_type: `achievement_${ach.slug}`,
            points_earned: ach.bonus_points,
            reference_id: ach.slug,
            earned_at: now,
          });
        }
      }
    }
  }

  // Upsert new achievements
  for (let i = 0; i < toInsert.length; i += 100) {
    const { error } = await db
      .from('learner_achievements')
      .upsert(toInsert.slice(i, i + 100), { onConflict: 'learner_id,achievement_slug', ignoreDuplicates: true });
    if (error) console.warn('[Achievements] Upsert error:', error.message);
    else awarded += Math.min(100, toInsert.length - i);
  }

  // Award bonus points for new achievements
  for (let i = 0; i < bonusEvents.length; i += 100) {
    await db.from('points_events').upsert(bonusEvents.slice(i, i + 100), {
      onConflict: 'learner_id,event_type,reference_id', ignoreDuplicates: true,
    });
  }

  console.log(`[Achievements] Awarded ${awarded} new badges`);
  return awarded;
}
