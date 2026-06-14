import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
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

  const { data: assignments } = await db
    .from('assignments')
    .select('*, courses(name), learners(full_name)')
    .eq('company_id', company.id)
    .order('submitted_at', { ascending: false });

  return NextResponse.json({
    quizzes: quizzes || [],
    assignments: assignments || [],
  });
}
