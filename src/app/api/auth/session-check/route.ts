import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const session = getAdminSession(req);

  if (!session) return NextResponse.json({ valid: false });

  // Admin sessions never expire via passcode deletion
  if (session.role === 'admin') return NextResponse.json({ valid: true });

  // Company sessions: old tokens without passcodeId are invalid
  if (session.role === 'company') {
    if (!session.passcodeId) return NextResponse.json({ valid: false });

    const db = createAdminClient();
    if (!db) return NextResponse.json({ valid: true }); // can't check DB, give benefit of doubt

    const { data } = await db
      .from('passcodes')
      .select('id')
      .eq('id', session.passcodeId)
      .maybeSingle();

    return NextResponse.json({ valid: !!data });
  }

  return NextResponse.json({ valid: false });
}
