import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCSV, csvResponse } from '@/lib/exports/csv';
import { exportDateStamp } from '@/lib/exports/json';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authError = requireCompanyOrAdmin(req, slug);
  if (authError) return authError;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const type = req.nextUrl.searchParams.get('type') || 'learners';
  const date = exportDateStamp();

  if (type === 'assessments') {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db.from('quizzes').select('*').eq('company_id', company.id).range(offset, offset + 999);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return csvResponse(toCSV(rows), `${slug}-assessments-${date}.csv`);
  }

  if (type === 'surveys') {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db.from('surveys').select('*').eq('company_id', company.id).range(offset, offset + 999);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return csvResponse(toCSV(rows), `${slug}-surveys-${date}.csv`);
  }

  if (type === 'attendance') {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await db.from('zoom_attendance').select('*').eq('company_id', company.id).range(offset, offset + 999);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return csvResponse(toCSV(rows), `${slug}-attendance-${date}.csv`);
  }

  // Default: learner progress — join latest status snapshot
  const learners: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learners')
      .select('id, full_name, email, department, title, last_active_at')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    learners.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }

  // Fetch latest status snapshot per learner
  const snapshotMap = new Map<string, { status: string; completion_percent: number; benchmark_percent: number }>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learner_status_snapshots')
      .select('learner_id, status, completion_percent, benchmark_percent, snapshot_date')
      .eq('company_id', company.id)
      .order('snapshot_date', { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const s of data) {
      if (!snapshotMap.has(s.learner_id)) {
        snapshotMap.set(s.learner_id, {
          status: s.status,
          completion_percent: Number(s.completion_percent ?? 0),
          benchmark_percent: Number(s.benchmark_percent ?? 0),
        });
      }
    }
    if (data.length < 1000) break;
  }

  const rows = learners.map((l) => {
    const snap = snapshotMap.get(l.id as string);
    return {
      'Name':                l.full_name,
      'Email':               l.email,
      'Title':               l.title,
      'Department':          l.department,
      'Status':              snap?.status ?? 'not_started',
      'Completion %':        snap?.completion_percent ?? 0,
      'Benchmark %':         snap?.benchmark_percent ?? 0,
      'Last Active':         l.last_active_at,
    };
  });

  return csvResponse(toCSV(rows, undefined, false), `${slug}-learners-${date}.csv`);
}
