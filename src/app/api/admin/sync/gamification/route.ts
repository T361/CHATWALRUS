export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { seedPointsFromActivity, recalculateAllPoints } from '@/lib/gamification/calculatePoints';
import { awardAchievements } from '@/lib/gamification/awardAchievements';
import { snapshotLeaderboard } from '@/lib/gamification/snapshotLeaderboard';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
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
