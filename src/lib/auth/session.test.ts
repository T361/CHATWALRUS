import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock server-only is handled by vitest.config.ts alias
// Mock next/server so we don't need the Next.js runtime
vi.mock('next/server', () => {
  return {
    NextRequest: class {},
    NextResponse: class {
      static json() { return {}; }
    },
  };
});

// We import AFTER setting up env in beforeEach — use dynamic import trick or just set env before top-level import.
// Since Vitest runs in Node, we can just set process.env before importing.

import {
  createAdminSessionToken,
  createCompanySessionToken,
  verifyAdminSessionToken,
  verifyAdminPasscode,
  verifySecret,
  isAdminAuthConfigured,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
} from './session';

const TEST_SECRET = 'test-session-secret-at-least-32-chars-long';
const TEST_ADMIN_PASSCODE = 'super-secret-admin-passcode';

describe('session constants', () => {
  it('ADMIN_SESSION_COOKIE has the expected name', () => {
    expect(ADMIN_SESSION_COOKIE).toBe('chatwalrus_admin_session');
  });

  it('ADMIN_SESSION_TTL_SECONDS is 12 hours', () => {
    expect(ADMIN_SESSION_TTL_SECONDS).toBe(12 * 60 * 60);
  });
});

describe('verifySecret', () => {
  it('returns true for matching strings', () => {
    expect(verifySecret('hello', 'hello')).toBe(true);
  });

  it('returns false for non-matching strings', () => {
    expect(verifySecret('hello', 'world')).toBe(false);
  });

  it('returns false when one string is empty', () => {
    expect(verifySecret('', 'hello')).toBe(false);
    expect(verifySecret('hello', '')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(verifySecret('Hello', 'hello')).toBe(false);
  });
});

describe('verifyAdminPasscode', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSCODE_SECRET = TEST_ADMIN_PASSCODE;
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSCODE_SECRET;
  });

  it('returns true for correct passcode', () => {
    expect(verifyAdminPasscode(TEST_ADMIN_PASSCODE)).toBe(true);
  });

  it('returns false for wrong passcode', () => {
    expect(verifyAdminPasscode('wrong-passcode')).toBe(false);
  });

  it('returns false when ADMIN_PASSCODE_SECRET is not set', () => {
    delete process.env.ADMIN_PASSCODE_SECRET;
    expect(verifyAdminPasscode(TEST_ADMIN_PASSCODE)).toBe(false);
  });

  it('returns false for empty passcode', () => {
    expect(verifyAdminPasscode('')).toBe(false);
  });
});

describe('isAdminAuthConfigured', () => {
  afterEach(() => {
    delete process.env.APP_SESSION_SECRET;
    delete process.env.ADMIN_PASSCODE_SECRET;
  });

  it('returns true when both env vars are set', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    process.env.ADMIN_PASSCODE_SECRET = TEST_ADMIN_PASSCODE;
    expect(isAdminAuthConfigured()).toBe(true);
  });

  it('returns false when APP_SESSION_SECRET is missing', () => {
    delete process.env.APP_SESSION_SECRET;
    process.env.ADMIN_PASSCODE_SECRET = TEST_ADMIN_PASSCODE;
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it('returns false when ADMIN_PASSCODE_SECRET is missing', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    delete process.env.ADMIN_PASSCODE_SECRET;
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it('returns false when both are missing', () => {
    expect(isAdminAuthConfigured()).toBe(false);
  });
});

describe('createAdminSessionToken', () => {
  afterEach(() => {
    delete process.env.APP_SESSION_SECRET;
  });

  it('returns null when APP_SESSION_SECRET is not set', () => {
    delete process.env.APP_SESSION_SECRET;
    expect(createAdminSessionToken()).toBeNull();
  });

  it('returns a token object when secret is configured', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const result = createAdminSessionToken();
    expect(result).not.toBeNull();
    expect(result!.token).toBeTypeOf('string');
    expect(result!.expiresAt).toBeInstanceOf(Date);
    expect(result!.session).toBeDefined();
  });

  it('creates a token with admin role', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const result = createAdminSessionToken();
    expect(result!.session.role).toBe('admin');
  });

  it('creates a token with null companyId for admin', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const result = createAdminSessionToken();
    expect(result!.session.companyId).toBeNull();
    expect(result!.session.companySlug).toBeNull();
  });

  it('token is in format encodedPayload.signature', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const result = createAdminSessionToken();
    const parts = result!.token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('expiresAt is approximately 12 hours from now', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const before = Date.now();
    const result = createAdminSessionToken();
    const after = Date.now();
    const expectedTtlMs = 12 * 60 * 60 * 1000;
    expect(result!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedTtlMs - 1000);
    expect(result!.expiresAt.getTime()).toBeLessThanOrEqual(after + expectedTtlMs + 1000);
  });

  it('session.issuedAt is approximately current unix timestamp', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const before = Math.floor(Date.now() / 1000);
    const result = createAdminSessionToken();
    const after = Math.floor(Date.now() / 1000);
    expect(result!.session.issuedAt).toBeGreaterThanOrEqual(before);
    expect(result!.session.issuedAt).toBeLessThanOrEqual(after);
  });

  it('two tokens are different (nonce randomness)', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const a = createAdminSessionToken();
    const b = createAdminSessionToken();
    expect(a!.token).not.toBe(b!.token);
  });
});

describe('createCompanySessionToken', () => {
  afterEach(() => {
    delete process.env.APP_SESSION_SECRET;
  });

  it('returns null when APP_SESSION_SECRET is not set', () => {
    delete process.env.APP_SESSION_SECRET;
    expect(createCompanySessionToken('company-id', 'my-company')).toBeNull();
  });

  it('creates a token with company role', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const result = createCompanySessionToken('company-123', 'acme-corp');
    expect(result!.session.role).toBe('company');
  });

  it('embeds companyId and companySlug in session', () => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
    const result = createCompanySessionToken('company-123', 'acme-corp');
    expect(result!.session.companyId).toBe('company-123');
    expect(result!.session.companySlug).toBe('acme-corp');
  });
});

describe('verifyAdminSessionToken', () => {
  beforeEach(() => {
    process.env.APP_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.APP_SESSION_SECRET;
  });

  it('returns null for undefined token', () => {
    expect(verifyAdminSessionToken(undefined)).toBeNull();
  });

  it('returns null for null token', () => {
    expect(verifyAdminSessionToken(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(verifyAdminSessionToken('')).toBeNull();
  });

  it('returns null when APP_SESSION_SECRET is not set', () => {
    delete process.env.APP_SESSION_SECRET;
    const token = 'fake.token';
    expect(verifyAdminSessionToken(token)).toBeNull();
  });

  it('verifies a valid admin token', () => {
    const created = createAdminSessionToken();
    const session = verifyAdminSessionToken(created!.token);
    expect(session).not.toBeNull();
    expect(session!.role).toBe('admin');
  });

  it('verifies a valid company token', () => {
    const created = createCompanySessionToken('company-123', 'acme-corp');
    const session = verifyAdminSessionToken(created!.token);
    expect(session).not.toBeNull();
    expect(session!.role).toBe('company');
    expect(session!.companyId).toBe('company-123');
    expect(session!.companySlug).toBe('acme-corp');
  });

  it('returns null for tampered payload', () => {
    const created = createAdminSessionToken();
    const [payload, signature] = created!.token.split('.');
    // Tamper with payload by appending a char
    const tampered = `${payload}X.${signature}`;
    expect(verifyAdminSessionToken(tampered)).toBeNull();
  });

  it('returns null for tampered signature', () => {
    const created = createAdminSessionToken();
    const [payload, signature] = created!.token.split('.');
    // Tamper with signature
    const tampered = `${payload}.${signature}X`;
    expect(verifyAdminSessionToken(tampered)).toBeNull();
  });

  it('returns null for token with wrong secret', () => {
    const created = createAdminSessionToken();
    process.env.APP_SESSION_SECRET = 'a-completely-different-secret-value';
    expect(verifyAdminSessionToken(created!.token)).toBeNull();
  });

  it('returns null for token with no dot separator', () => {
    expect(verifyAdminSessionToken('nodottoken')).toBeNull();
  });

  it('returns null for token with more than one dot', () => {
    expect(verifyAdminSessionToken('a.b.c')).toBeNull();
  });

  it('returns null for expired token', () => {
    // Manually craft an expired token
    const secret = TEST_SECRET;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      role: 'admin',
      iat: now - 100,
      exp: now - 1, // already expired
      nonce: 'testnonce',
      companyId: null,
      companySlug: null,
    };
    const { createHmac } = require('crypto');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    const expiredToken = `${encodedPayload}.${signature}`;
    expect(verifyAdminSessionToken(expiredToken)).toBeNull();
  });

  it('returns null for token with invalid role', () => {
    const secret = TEST_SECRET;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      role: 'superuser', // not valid
      iat: now,
      exp: now + 3600,
      nonce: 'testnonce',
    };
    const { createHmac } = require('crypto');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    const token = `${encodedPayload}.${signature}`;
    expect(verifyAdminSessionToken(token)).toBeNull();
  });

  it('returns the correct expiresAt from token', () => {
    const created = createAdminSessionToken();
    const session = verifyAdminSessionToken(created!.token);
    expect(session!.expiresAt).toBe(created!.session.expiresAt);
  });

  it('returns the correct issuedAt from token', () => {
    const created = createAdminSessionToken();
    const session = verifyAdminSessionToken(created!.token);
    expect(session!.issuedAt).toBe(created!.session.issuedAt);
  });

  it('admin session has null companyId and companySlug', () => {
    const created = createAdminSessionToken();
    const session = verifyAdminSessionToken(created!.token);
    expect(session!.companyId).toBeNull();
    expect(session!.companySlug).toBeNull();
  });
});
