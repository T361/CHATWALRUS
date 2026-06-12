import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { createServerClientSafe } from '@/lib/supabase/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  const { id } = await params;
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const body = await req.json();

  const { error } = await db
    .from('alerts')
    .update({
      status: 'actioned',
      actioned_by: body.actioned_by || 'admin',
      actioned_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: 'ok' });
}
