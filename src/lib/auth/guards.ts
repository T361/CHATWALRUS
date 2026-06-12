import { NextRequest, NextResponse } from 'next/server';

/**
 * Common response for unauthorized requests.
 */
export function unauthorizedJson(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
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
 * If CRON_SECRET is not set in env, it allows the request (for local dev dev).
 */
export function requireCronSecret(req: NextRequest): boolean {
  const token = getBearerToken(req);
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) return true; // Fail-open in dev if no secret set
  return token === cronSecret;
}

/**
 * Checks if the request is allowed via CRON_SECRET or an Admin Session.
 * Since real session auth is a skeleton, this currently only checks CRON_SECRET
 * or a placeholder 'authorization' header for admin.
 * 
 * TODO: Implement real cookie/JWT based session check here.
 */
export function requireAdminOrCron(req: NextRequest): boolean {
  if (requireCronSecret(req)) return true;
  
  // Real auth is skeleton. For now, checking if there is ANY authorization
  // token that signifies an admin. 
  // TODO: Replace with real JWT/session validation.
  const token = getBearerToken(req);
  if (token) {
    // Skeleton check: assume any bearer token that isn't the cron secret might be a test token
    // In production, this MUST validate the token.
    return true; 
  }
  
  // No cron secret match, no session/token
  return false;
}
