import { NextRequest, NextResponse } from 'next/server';
import { createServerClientSafe } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const body = await req.json();
  const { passcode } = body;

  if (!passcode) {
    return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
  }

  const { data: entry } = await db
    .from('passcodes')
    .select('id, role, company_id, status')
    .eq('code', passcode)
    .eq('status', 'active')
    .single();

  if (!entry) {
    return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
  }

  // TODO: Implement proper session management with APP_SESSION_SECRET
  // For now, return role info that the frontend can store
  return NextResponse.json({
    authenticated: true,
    role: entry.role,
    company_id: entry.company_id,
  });
}
