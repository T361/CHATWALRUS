import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, verifySecret } from './session';
import { createAdminClient } from '@/lib/supabase/admin';

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
 * Checks if the request has a valid company (or admin) session.
 * For company sessions, also verifies that the passcode used to create
 * the session still exists in the database (i.e. has not been deleted).
 * Returns null if valid, or a NextResponse with status 401 if not.
 */
export async function requireCompanyAuth(req: NextRequest): Promise<AuthGuardResult> {
  const session = getAdminSession(req);
  if (!session) return unauthorizedJson();

  // Admins have unrestricted access
  if (session.role === 'admin') return null;

  // Company sessions must have a still-valid passcode
  if (session.role === 'company' && session.passcodeId) {
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { data } = await db
      .from('passcodes')
      .select('id')
      .eq('id', session.passcodeId)
      .maybeSingle();

    if (!data) {
      // Passcode was deleted — force re-login
      return unauthorizedJson('Session is no longer valid. Please log in again.');
    }
  }

  return null;
}

/**
 * Checks if the request has an Admin session with role === 'admin'.
 * Company sessions are explicitly rejected.
 */
export function requireAdmin(req: NextRequest): AuthGuardResult {
  const session = getAdminSession(req);
  if (!session) return unauthorizedJson();
  if (session.role !== 'admin') return unauthorizedJson('Admin access required');
  return null;
}

/**
 * Checks if the request is allowed via CRON_SECRET or an Admin session.
 * Company-role sessions are explicitly rejected — use requireCompanyOrAdmin for slug-scoped routes.
 */
export function requireAdminOrCron(req: NextRequest): AuthGuardResult {
  const session = getAdminSession(req);
  if (session) {
    if (session.role !== 'admin') return unauthorizedJson('Admin access required');
    return null;
  }

  const token = getBearerToken(req);
  if (!token) return unauthorizedJson();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return cronSecretNotConfiguredJson();
  if (!verifySecret(token, cronSecret)) return unauthorizedJson();

  return null;
}

/**
 * Checks if the request is allowed for a specific company slug.
 * Admin sessions are always allowed. Company sessions are allowed only when
 * session.companySlug matches the requested slug. Cron is not allowed.
 */
export function requireCompanyOrAdmin(req: NextRequest, slug: string): AuthGuardResult {
  const session = getAdminSession(req);
  if (!session) return unauthorizedJson();
  if (session.role === 'admin') return null;
  if (session.role === 'company' && session.companySlug === slug) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
