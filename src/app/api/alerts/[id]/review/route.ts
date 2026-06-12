import { NextRequest, NextResponse } from 'next/server';
import { createServerClientSafe } from '@/lib/supabase/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const body = await req.json();

  const { error } = await db
    .from('alerts')
    .update({
      status: 'reviewed',
      reviewed_by: body.reviewed_by || 'admin',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: 'ok' });
}
