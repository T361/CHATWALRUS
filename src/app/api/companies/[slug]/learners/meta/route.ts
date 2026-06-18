import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLearnerDirectoryMeta } from '@/lib/learners/directory';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { slug } = await params;
  const db = createAdminClient();
  const { data: company } = await db
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const result = await getLearnerDirectoryMeta(company.id);
  return NextResponse.json(result);
}
