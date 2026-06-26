import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, isAdminAuthConfigured } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/guards';
import { isThinkificConfigured } from '@/lib/thinkific/client';
import { isZoomConfigured } from '@/lib/zoom/client';
import { createAdminClient, isAdminConfigured as isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { readThroughTtlCache } from '@/lib/cache/serverCache';
import { withServerTiming } from '@/lib/perf';
import { isMissingRelationError } from '@/lib/utils/db';
import { getWeeklyRollupHealth } from '@/lib/weekly/rollups';

interface ProbeResult {
  connected: boolean;
  status: number | null;
  message: string | null;
}

type SurveySyncLogRow = {
  status: string | null;
  records_processed: number | null;
  error_message: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

async function probeSupabase(
  key: string | undefined,
  table: string
): Promise<ProbeResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !key) {
    return {
      connected: false,
      status: null,
      message: 'Missing Supabase URL or key',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let message: string | null = null;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message || parsed.error || null;
    } catch {
      message = text || null;
    }

    return {
      connected: response.ok,
      status: response.status,
      message,
    };
  } catch (error) {
    return {
      connected: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeThinkific(): Promise<ProbeResult> {
  const apiKey = process.env.THINKIFIC_API_KEY;
  const subdomain = process.env.THINKIFIC_SUBDOMAIN;
  const baseUrl = process.env.THINKIFIC_BASE_URL || 'https://api.thinkific.com/api/public/v1';

  if (!apiKey || !subdomain) {
    return {
      connected: false,
      status: null,
      message: 'Missing Thinkific API key or subdomain',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/courses?limit=1&page=1`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let message: string | null = null;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.error || parsed.message || null;
    } catch {
      message = text || null;
    }

    return {
      connected: response.ok,
      status: response.status,
      message,
    };
  } catch (error) {
    return {
      connected: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getLearnerRollupHealth() {
  const db = createAdminClient();
  const [activeLearnersResult, activeLearnerCompaniesResult] = await Promise.all([
    db.from('learners').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('learners').select('company_id').eq('is_active', true).not('company_id', 'is', null),
  ]);

  if (activeLearnersResult.error) throw activeLearnersResult.error;
  if (activeLearnerCompaniesResult.error) throw activeLearnerCompaniesResult.error;

  const activeLearners = Number(activeLearnersResult.count ?? 0);
  const companiesWithActiveLearners = new Set(
    (activeLearnerCompaniesResult.data || [])
      .map((row) => row.company_id)
      .filter((value): value is string => !!value)
  ).size;

  try {
    const [rollupRowsResult, rollupCompanyRowsResult] = await Promise.all([
      db.from('learner_directory_rollups').select('learner_id', { count: 'exact', head: true }),
      db.from('learner_directory_rollups').select('company_id').not('company_id', 'is', null),
    ]);

    if (rollupRowsResult.error) throw rollupRowsResult.error;
    if (rollupCompanyRowsResult.error) throw rollupCompanyRowsResult.error;

    const rollupRows = Number(rollupRowsResult.count ?? 0);
    const companiesWithRollupRows = new Set(
      (rollupCompanyRowsResult.data || [])
        .map((row) => row.company_id)
        .filter((value): value is string => !!value)
    ).size;

    const healthy = activeLearners === 0 || rollupRows >= activeLearners;
    let message: string | null = null;
    if (!healthy) {
      message = 'Rollup table exists but is not fully populated. Run Backfill Learner Rollups.';
    }

    return {
      relation_present: true,
      active_learners: activeLearners,
      rollup_rows: rollupRows,
      companies_with_active_learners: companiesWithActiveLearners,
      companies_with_rollup_rows: companiesWithRollupRows,
      healthy,
      message,
    };
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;

    return {
      relation_present: false,
      active_learners: activeLearners,
      rollup_rows: 0,
      companies_with_active_learners: companiesWithActiveLearners,
      companies_with_rollup_rows: 0,
      healthy: false,
      message: 'learner_directory_rollups is missing. Apply migration 006.',
    };
  }
}

async function getSurveyDataHealth() {
  const db = createAdminClient();
  const { count: storedReviewsCount, error: surveysError } = await db
    .from('surveys')
    .select('id', { count: 'exact', head: true });
  if (surveysError) throw surveysError;

  let latestSync: SurveySyncLogRow | null = null;

  try {
    const { data, error } = await db
      .from('sync_logs')
      .select('status, records_processed, error_message, completed_at, metadata')
      .eq('sync_type', 'surveys')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    latestSync = (data ?? null) as SurveySyncLogRow | null;
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
  }

  const storedReviews = Number(storedReviewsCount ?? 0);
  const latestMetadata = latestSync?.metadata ?? null;
  const upstreamReviews = Number(latestMetadata?.upstream_reviews_found ?? 0);
  const endpointErrors = Array.isArray(latestMetadata?.endpoint_errors)
    ? latestMetadata.endpoint_errors.length
    : 0;
  const healthy = storedReviews > 0 || latestSync?.status === 'success';
  let message: string | null = null;

  if (storedReviews === 0 && latestSync?.status === 'success') {
    message = 'No stored survey reviews. Latest Thinkific course_reviews sync completed with zero upstream reviews.';
  } else if (latestSync?.status === 'error') {
    message = latestSync.error_message || 'Latest survey sync failed.';
  }

  return {
    relation_present: true,
    stored_reviews: storedReviews,
    latest_sync_status: latestSync?.status ?? null,
    latest_records_processed: Number(latestSync?.records_processed ?? 0),
    latest_completed_at: latestSync?.completed_at ?? null,
    upstream_reviews_found: upstreamReviews,
    endpoint_errors: endpointErrors,
    healthy,
    message,
  };
}

export async function GET(req: NextRequest) {
  return withServerTiming('admin.settings.status', async () => {
    const authError = requireAdmin(req);
    if (authError) return authError;
    const session = getAdminSession(req)!;

    const includeProbes = req.nextUrl.searchParams.get('include_probes') === '1';

    const baseResponse = {
      auth: {
        authenticated: !!session,
        configured: isAdminAuthConfigured(),
        role: session?.role ?? null,
        expires_at: session ? new Date(session.expiresAt * 1000).toISOString() : null,
      },
      integrations: {
        supabase: {
          configured: !!(
            process.env.NEXT_PUBLIC_SUPABASE_URL &&
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          ),
          admin_configured: isSupabaseAdminConfigured(),
          public_probe: null as ProbeResult | null,
          admin_probe: null as ProbeResult | null,
        },
        thinkific: {
          configured: isThinkificConfigured(),
          probe: null as ProbeResult | null,
        },
        zoom: {
          configured: isZoomConfigured(),
        },
        slack: {
          configured: !!process.env.SLACK_BOT_TOKEN,
        },
      },
      data_health: {
        learner_rollups: null as Awaited<ReturnType<typeof getLearnerRollupHealth>> | null,
        weekly_rollups: null as Awaited<ReturnType<typeof getWeeklyRollupHealth>> | null,
        surveys: null as Awaited<ReturnType<typeof getSurveyDataHealth>> | null,
      },
    };

    if (!includeProbes) {
      const [rollupHealth, weeklyRollupHealth, surveyHealth] = await Promise.all([
        readThroughTtlCache('settings-status:learner-rollups', 5_000, getLearnerRollupHealth),
        readThroughTtlCache('settings-status:weekly-rollups', 5_000, getWeeklyRollupHealth),
        readThroughTtlCache('settings-status:surveys', 5_000, getSurveyDataHealth),
      ]);
      return NextResponse.json({
        ...baseResponse,
        data_health: {
          learner_rollups: rollupHealth,
          weekly_rollups: weeklyRollupHealth,
          surveys: surveyHealth,
        },
      });
    }

    const probes = await readThroughTtlCache('settings-status:probes', 15_000, async () => {
      const [supabasePublic, supabaseAdmin, thinkific] = await Promise.all([
        probeSupabase(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'companies'),
        probeSupabase(process.env.SUPABASE_SERVICE_ROLE_KEY, 'companies'),
        probeThinkific(),
      ]);
      return { supabasePublic, supabaseAdmin, thinkific };
    });
    const [rollupHealth, weeklyRollupHealth, surveyHealth] = await Promise.all([
      readThroughTtlCache('settings-status:learner-rollups', 5_000, getLearnerRollupHealth),
      readThroughTtlCache('settings-status:weekly-rollups', 5_000, getWeeklyRollupHealth),
      readThroughTtlCache('settings-status:surveys', 5_000, getSurveyDataHealth),
    ]);

    return NextResponse.json({
      ...baseResponse,
      integrations: {
        ...baseResponse.integrations,
        supabase: {
          ...baseResponse.integrations.supabase,
          public_probe: probes.supabasePublic,
          admin_probe: probes.supabaseAdmin,
        },
        thinkific: {
          ...baseResponse.integrations.thinkific,
          probe: probes.thinkific,
        },
      },
      data_health: {
        learner_rollups: rollupHealth,
        weekly_rollups: weeklyRollupHealth,
        surveys: surveyHealth,
      },
    });
  });
}
