import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, verifySecret } from './session';

export type AuthGuardResult = NextResponse | null;

/**
 * Common response for unauthorized requests.
 */
export function unauthorizedJson(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function cronSecretNotConfiguredJson() {
  return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
}

export function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
}

/**
 * Checks if the request provides a valid CRON_SECRET.
 */
export function requireCronSecret(req: NextRequest): AuthGuardResult {
  const token = getBearerToken(req);
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return cronSecretNotConfiguredJson();
  if (!token || !verifySecret(token, cronSecret)) return unauthorizedJson();

  return null;
}

/**
 * Checks if the request is allowed via CRON_SECRET or an Admin Session.
 */
export function requireAdminOrCron(req: NextRequest): AuthGuardResult {
  if (getAdminSession(req)) return null;

  const token = getBearerToken(req);
  if (!token) return unauthorizedJson();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return cronSecretNotConfiguredJson();
  if (!verifySecret(token, cronSecret)) return unauthorizedJson();

  return null;
}
