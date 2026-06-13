import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const session = getAdminSession(req);

  return NextResponse.json({
    authenticated: !!session,
    role: session?.role ?? null,
    expires_at: session ? new Date(session.expiresAt * 1000).toISOString() : null,
  });
}
