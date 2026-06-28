export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { seedPointsFromActivity, recalculateAllPoints } from '@/lib/gamification/calculatePoints';
import { awardAchievements } from '@/lib/gamification/awardAchievements';
import { snapshotLeaderboard } from '@/lib/gamification/snapshotLeaderboard';

// Supports ?step=seed|recalculate|achievements|snapshot so the frontend can
// call each operation individually and stay within Vercel Hobby's 60s limit.
// Without ?step, runs all 4 in sequence (for Vercel Pro / local dev).
export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const step = req.nextUrl.searchParams.get('step');

  try {
    if (step === 'seed') {
      await seedPointsFromActivity();
      return NextResponse.json({ status: 'success', records_processed: 0, step: 'seed' });
    }

    if (step === 'recalculate') {
      const learnersRecalculated = await recalculateAllPoints();
      return NextResponse.json({ status: 'success', records_processed: learnersRecalculated, learners_recalculated: learnersRecalculated, step: 'recalculate' });
    }

    if (step === 'achievements') {
      const achievementsAwarded = await awardAchievements();
      return NextResponse.json({ status: 'success', records_processed: achievementsAwarded, achievements_awarded: achievementsAwarded, step: 'achievements' });
    }

    if (step === 'snapshot') {
      const snapshotCount = await snapshotLeaderboard();
      return NextResponse.json({ status: 'success', records_processed: snapshotCount, snapshot_rows: snapshotCount, step: 'snapshot' });
    }

    // No step param — run all (Pro/local only)
    await seedPointsFromActivity();
    const learnersRecalculated = await recalculateAllPoints();
    const achievementsAwarded = await awardAchievements();
    const snapshotCount = await snapshotLeaderboard();

    return NextResponse.json({
      status: 'success',
      records_processed: learnersRecalculated,
      learners_recalculated: learnersRecalculated,
      achievements_awarded: achievementsAwarded,
      snapshot_rows: snapshotCount,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
