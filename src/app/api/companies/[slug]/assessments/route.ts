import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const { slug } = await params;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const { data: quizzes } = await db
    .from('quizzes')
    .select('*, courses(name), learners(full_name)')
    .eq('company_id', company.id)
    .order('attempted_at', { ascending: false });

  // Paginate all assignments to get accurate counts — Supabase caps at 1k rows per
  // request, so a single .limit(N) silently truncates for large companies.
  // Submitted assignments are loaded first so the display table shows real completions.
  const allAssignments: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('assignments')
      .select('*, courses(name), learners(full_name)')
      .eq('company_id', company.id)
      .order('submitted', { ascending: false })
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    allAssignments.push(...page);
    if (page.length < 1000) break;
  }

  return NextResponse.json({
    quizzes: quizzes || [],
    assignments: allAssignments,
  });
}
