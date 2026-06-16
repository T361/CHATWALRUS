export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { slug } = await params;
  const db = createAdminClient();

  const { data: company } = await db.from('companies').select('id').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await db
    .from('interventions')
    .select('id, learner_id, csm_email, intervention_type, note, follow_up_date, created_at, learners(full_name, email)')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interventions: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { slug } = await params;
  const db = createAdminClient();

  const { data: company } = await db.from('companies').select('id').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { intervention_type, note, follow_up_date, learner_id, csm_email } = body;

  if (!note?.trim()) return NextResponse.json({ error: 'Note is required' }, { status: 400 });

  const { data, error } = await db
    .from('interventions')
    .insert({
      company_id: company.id,
      learner_id: learner_id || null,
      csm_email: csm_email || null,
      intervention_type: intervention_type || 'note',
      note: note.trim(),
      follow_up_date: follow_up_date || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ intervention: data }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from('companies').select('id').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await db
    .from('interventions')
    .delete()
    .eq('id', id)
    .eq('company_id', company.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
