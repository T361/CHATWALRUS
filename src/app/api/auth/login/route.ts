import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminSessionToken,
  isAdminAuthConfigured,
  setAdminSessionCookie,
  verifyAdminPasscode,
} from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json({ error: 'Admin auth not configured' }, { status: 503 });
  }

  let body: { passcode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const passcode = typeof body.passcode === 'string' ? body.passcode : '';

  if (!passcode) {
    return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
  }

  if (!verifyAdminPasscode(passcode)) {
    return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
  }

  const sessionToken = createAdminSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: 'Admin auth not configured' }, { status: 503 });
  }

  const response = NextResponse.json({
    authenticated: true,
    role: sessionToken.session.role,
    expires_at: sessionToken.expiresAt.toISOString(),
  });
  setAdminSessionCookie(response, sessionToken.token, sessionToken.expiresAt);

  return response;
}
