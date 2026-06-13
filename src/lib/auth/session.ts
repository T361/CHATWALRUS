// =============================================================================
// Admin Session Helpers (SERVER ONLY)
// =============================================================================
// Uses Node crypto and must not be imported by client components.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'chatwalrus_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface AdminSession {
  role: 'admin';
  issuedAt: number;
  expiresAt: number;
}

interface SessionPayload {
  role: 'admin';
  iat: number;
  exp: number;
  nonce: string;
}

function getSessionSecret(): string | null {
  return process.env.APP_SESSION_SECRET || null;
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    const length = Math.max(aBuffer.length, bBuffer.length);
    const paddedA = Buffer.alloc(length);
    const paddedB = Buffer.alloc(length);
    aBuffer.copy(paddedA);
    bBuffer.copy(paddedB);
    timingSafeEqual(paddedA, paddedB);
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function verifySecret(value: string, expected: string): boolean {
  return constantTimeEqual(value, expected);
}

export function verifyAdminPasscode(passcode: string): boolean {
  const expected = process.env.ADMIN_PASSCODE_SECRET;
  if (!expected) return false;
  return verifySecret(passcode, expected);
}

export function isAdminAuthConfigured(): boolean {
  return !!(process.env.APP_SESSION_SECRET && process.env.ADMIN_PASSCODE_SECRET);
}

export function createAdminSessionToken(): {
  token: string;
  expiresAt: Date;
  session: AdminSession;
} | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_SECONDS;
  const payload: SessionPayload = {
    role: 'admin',
    iat: issuedAt,
    exp: expiresAt,
    nonce: randomBytes(16).toString('base64url'),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000),
    session: {
      role: payload.role,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    },
  };
}

export function verifyAdminSessionToken(token: string | undefined | null): AdminSession | null {
  const secret = getSessionSecret();
  if (!secret || !token) return null;

  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.role !== 'admin' || !payload.exp || payload.exp <= now) {
      return null;
    }

    return {
      role: payload.role,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getAdminSession(req: NextRequest): AdminSession | null {
  return verifyAdminSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function setAdminSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}
