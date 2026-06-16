// =============================================================================
// Gamification — Points Engine
// Points are idempotent: UNIQUE(learner_id, event_type, reference_id) in DB
// prevents double-awarding even if run multiple times.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';

// ── Point values ──────────────────────────────────────────────────────────────
export const POINTS = {
  zoom_session:       50,   // attended a live session / webinar
  lesson_complete:    10,   // completed a lesson
  quiz_pass:          25,   // passed a quiz
  course_complete:   100,   // completed a full course
  assignment:         20,   // submitted an assignment
  survey:             15,   // submitted a survey
  streak_7:           50,   // maintained 7-day streak
  streak_30:         200,   // maintained 30-day streak
  on_pace:            30,   // on-track at milestone check
} as const;

export type PointEventType = keyof typeof POINTS;

interface PointsResult {
  learnerId: string;
  pointsAwarded: number;
  eventsInserted: number;
}

/**
 * Award points for a single event. Silently skips if already awarded
 * (UNIQUE constraint in points_events).
 */
export async function awardPoints(
  learnerId: string,
  companyId: string | null,
  eventType: PointEventType,
  referenceId: string,
): Promise<number> {
  const db = createAdminClient();
  const points = POINTS[eventType];

  const { error } = await db.from('points_events').upsert(
    {
      learner_id: learnerId,
      company_id: companyId,
      event_type: eventType,
      points_earned: points,
      reference_id: referenceId,
      earned_at: new Date().toISOString(),
    },
    { onConflict: 'learner_id,event_type,reference_id', ignoreDuplicates: true },
  );

  if (error) {
    console.warn(`[Gamification] Failed to award points (${eventType}/${referenceId}):`, error.message);
    return 0;
  }

  return points;
}

/**
 * Recalculate total points for every learner from their points_events rows,
 * then upsert into learner_points.
 */
export async function recalculateAllPoints(): Promise<number> {
  const db = createAdminClient();
  let processed = 0;

  // Aggregate all events per learner
  const { data: events, error } = await db
    .from('points_events')
    .select('learner_id, company_id, event_type, points_earned');

  if (error) throw new Error(`[Gamification] Failed to fetch events: ${error.message}`);
  if (!events || events.length === 0) return 0;

  // Build per-learner totals
  type LearnerTotals = {
    company_id: string | null;
    total: number;
    zoom: number;
    lesson: number;
    quiz: number;
    course: number;
    assignment: number;
    survey: number;
    streak: number;
    sessions: number;
  };

  const totals = new Map<string, LearnerTotals>();

  for (const ev of events) {
    const lid = ev.learner_id;
    if (!totals.has(lid)) {
      totals.set(lid, {
        company_id: ev.company_id,
        total: 0, zoom: 0, lesson: 0, quiz: 0,
        course: 0, assignment: 0, survey: 0, streak: 0, sessions: 0,
      });
    }
    const t = totals.get(lid)!;
    t.total += ev.points_earned;

    switch (ev.event_type as PointEventType) {
      case 'zoom_session':     t.zoom       += ev.points_earned; t.sessions++; break;
      case 'lesson_complete':  t.lesson     += ev.points_earned; break;
      case 'quiz_pass':        t.quiz       += ev.points_earned; break;
      case 'course_complete':  t.course     += ev.points_earned; break;
      case 'assignment':       t.assignment += ev.points_earned; break;
      case 'survey':           t.survey     += ev.points_earned; break;
      case 'streak_7':
      case 'streak_30':
      case 'on_pace':          t.streak     += ev.points_earned; break;
    }
  }

  // Upsert learner_points in batches
  const rows = Array.from(totals.entries()).map(([learner_id, t]) => ({
    learner_id,
    company_id: t.company_id,
    total_points: t.total,
    zoom_attendance_points: t.zoom,
    lesson_completion_points: t.lesson,
    quiz_points: t.quiz,
    course_completion_points: t.course,
    assignment_points: t.assignment,
    survey_points: t.survey,
    streak_bonus_points: t.streak,
    sessions_attended: t.sessions,
    last_calculated_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error: upsertErr } = await db
      .from('learner_points')
      .upsert(rows.slice(i, i + 100), { onConflict: 'learner_id' });
    if (upsertErr) console.warn('[Gamification] learner_points upsert error:', upsertErr.message);
    processed += Math.min(100, rows.length - i);
  }

  return processed;
}

/**
 * Scan all activity sources and award missing points events.
 * Idempotent — skips already-awarded events via UNIQUE constraint.
 */
export async function seedPointsFromActivity(): Promise<PointsResult[]> {
  const db = createAdminClient();
  const results: PointsResult[] = [];

  // Load all learners for company_id lookup
  const learnerMap = new Map<string, string | null>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('learners').select('id, company_id').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const l of data) learnerMap.set(l.id, l.company_id);
    if (data.length < 1000) break;
  }

  // ── Zoom attendance ────────────────────────────────────────────────────────
  {
    const batch: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('zoom_attendance')
        .select('learner_id, company_id, zoom_session_id')
        .eq('attended', true)
        .not('learner_id', 'is', null)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const r of data) {
        batch.push({
          learner_id: r.learner_id,
          company_id: r.company_id,
          event_type: 'zoom_session',
          points_earned: POINTS.zoom_session,
          reference_id: r.zoom_session_id,
          earned_at: new Date().toISOString(),
        });
      }
      if (data.length < 1000) break;
    }
    if (batch.length > 0) {
      for (let i = 0; i < batch.length; i += 100) {
        await db.from('points_events').upsert(batch.slice(i, i + 100), {
          onConflict: 'learner_id,event_type,reference_id',
          ignoreDuplicates: true,
        });
      }
      results.push({ learnerId: 'all', pointsAwarded: batch.length * POINTS.zoom_session, eventsInserted: batch.length });
    }
  }

  // ── Enrollment completions → course_complete ───────────────────────────────
  {
    const batch: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('enrollments')
        .select('learner_id, company_id, id, thinkific_enrollment_id')
        .eq('is_completed', true)
        .not('learner_id', 'is', null)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const r of data) {
        batch.push({
          learner_id: r.learner_id,
          company_id: r.company_id,
          event_type: 'course_complete',
          points_earned: POINTS.course_complete,
          reference_id: String(r.thinkific_enrollment_id ?? r.id),
          earned_at: new Date().toISOString(),
        });
      }
      if (data.length < 1000) break;
    }
    for (let i = 0; i < batch.length; i += 100) {
      await db.from('points_events').upsert(batch.slice(i, i + 100), {
        onConflict: 'learner_id,event_type,reference_id', ignoreDuplicates: true,
      });
    }
  }

  // ── Surveys → survey ───────────────────────────────────────────────────────
  {
    const batch: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('surveys')
        .select('learner_id, company_id, id')
        .not('learner_id', 'is', null)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const r of data) {
        batch.push({
          learner_id: r.learner_id,
          company_id: r.company_id,
          event_type: 'survey',
          points_earned: POINTS.survey,
          reference_id: r.id,
          earned_at: new Date().toISOString(),
        });
      }
      if (data.length < 1000) break;
    }
    for (let i = 0; i < batch.length; i += 100) {
      await db.from('points_events').upsert(batch.slice(i, i + 100), {
        onConflict: 'learner_id,event_type,reference_id', ignoreDuplicates: true,
      });
    }
  }

  // ── Assignments → assignment ────────────────────────────────────────────────
  {
    const batch: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db
        .from('assignments')
        .select('learner_id, company_id, id')
        .not('learner_id', 'is', null)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const r of data) {
        batch.push({
          learner_id: r.learner_id,
          company_id: r.company_id,
          event_type: 'assignment',
          points_earned: POINTS.assignment,
          reference_id: r.id,
          earned_at: new Date().toISOString(),
        });
      }
      if (data.length < 1000) break;
    }
    for (let i = 0; i < batch.length; i += 100) {
      await db.from('points_events').upsert(batch.slice(i, i + 100), {
        onConflict: 'learner_id,event_type,reference_id', ignoreDuplicates: true,
      });
    }
  }

  return results;
}
