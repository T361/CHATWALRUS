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

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.status) updates.status = body.status;
  if (body.description !== undefined) updates.description = body.description;
  if (body.role) updates.role = body.role;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { error } = await db.from('passcodes').update(updates).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: 'ok' });
}
