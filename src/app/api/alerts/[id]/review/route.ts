import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const { id } = await params;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  // Verify the alert exists before updating
  const { data: existing } = await db.from('alerts').select('id').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });

  const { error } = await db
    .from('alerts')
    .update({
      status: 'reviewed',
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: 'ok' });
}
