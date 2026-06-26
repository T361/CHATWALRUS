import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock next/server so we don't need the Next.js runtime
vi.mock('next/server', () => {
  return {
    NextRequest: class {},
    NextResponse: {
      json: vi.fn((body: unknown, init?: ResponseInit) => ({ body, status: init?.status ?? 200, _isNextResponse: true })),
    },
  };
});

// Mock the session module — we control what getAdminSession returns per test
vi.mock('./session', () => ({
  getAdminSession: vi.fn(),
  verifySecret: vi.fn(),
  ADMIN_SESSION_COOKIE: 'chatwalrus_admin_session',
}));

// Mock the supabase admin client (used by requireCompanyAuth)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { getAdminSession, verifySecret } from './session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getBearerToken,
  unauthorizedJson,
  cronSecretNotConfiguredJson,
  requireCronSecret,
  requireAdminOrCron,
  requireAdmin,
  requireCompanyAuth,
} from './guards';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const mockGetAdminSession = getAdminSession as ReturnType<typeof vi.fn>;
const mockVerifySecret = verifySecret as ReturnType<typeof vi.fn>;
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

/** Build a minimal NextRequest-like object with the given headers and cookies. */
function makeReq(options: {
  authorization?: string;
  cookie?: string;
  cookieValue?: string; // value for ADMIN_SESSION_COOKIE
} = {}): any {
  const headers = new Map<string, string>();
  if (options.authorization) {
    headers.set('authorization', options.authorization);
  }

  return {
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    cookies: {
      get: (_name: string) => (options.cookieValue ? { value: options.cookieValue } : undefined),
    },
  };
}

/** AdminSession fixture for an admin user */
function adminSession() {
  return { role: 'admin' as const, issuedAt: 1000, expiresAt: 9999999999, companyId: null, companySlug: null, passcodeId: null };
}

/** AdminSession fixture for a company user */
function companySession(slug = 'acme', passcodeId: string | null = 'passcode-123') {
  return { role: 'company' as const, issuedAt: 1000, expiresAt: 9999999999, companyId: 'company-abc', companySlug: slug, passcodeId };
}

// ------------------------------------------------------------------
// getBearerToken
// ------------------------------------------------------------------

describe('getBearerToken', () => {
  it('returns null when there is no Authorization header', () => {
    const req = makeReq();
    expect(getBearerToken(req)).toBeNull();
  });

  it('returns null when Authorization header has wrong format (no Bearer prefix)', () => {
    const req = makeReq({ authorization: 'Token abc123' });
    expect(getBearerToken(req)).toBeNull();
  });

  it('returns null when Authorization header is just "Bearer" with no token', () => {
    const req = makeReq({ authorization: 'Bearer' });
    // split(' ')[1] is undefined → null returned
    expect(getBearerToken(req)).toBeNull();
  });

  it('extracts the token from a valid Bearer header', () => {
    const req = makeReq({ authorization: 'Bearer my-secret-token' });
    expect(getBearerToken(req)).toBe('my-secret-token');
  });

  it('handles tokens that contain special characters', () => {
    const req = makeReq({ authorization: 'Bearer abc.def.ghi' });
    expect(getBearerToken(req)).toBe('abc.def.ghi');
  });
});

// ------------------------------------------------------------------
// unauthorizedJson / cronSecretNotConfiguredJson
// ------------------------------------------------------------------

describe('unauthorizedJson', () => {
  it('returns a response with status 401', () => {
    const res = unauthorizedJson() as any;
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('accepts a custom message', () => {
    const res = unauthorizedJson('Custom error') as any;
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Custom error' });
  });
});

describe('cronSecretNotConfiguredJson', () => {
  it('returns a response with status 503', () => {
    const res = cronSecretNotConfiguredJson() as any;
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Cron secret not configured' });
  });
});

// ------------------------------------------------------------------
// requireCronSecret
// ------------------------------------------------------------------

describe('requireCronSecret', () => {
  const CRON_SECRET = 'my-cron-secret';

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it('returns 503 when CRON_SECRET env var is not configured', () => {
    delete process.env.CRON_SECRET;
    const req = makeReq({ authorization: 'Bearer some-token' });
    const result = requireCronSecret(req) as any;
    expect(result.status).toBe(503);
  });

  it('returns 401 when there is no Authorization header', () => {
    mockVerifySecret.mockReturnValue(false);
    const req = makeReq();
    const result = requireCronSecret(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns 401 when Authorization header has wrong format', () => {
    mockVerifySecret.mockReturnValue(false);
    const req = makeReq({ authorization: 'Token bad-format' });
    const result = requireCronSecret(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns 401 when token does not match CRON_SECRET', () => {
    mockVerifySecret.mockReturnValue(false);
    const req = makeReq({ authorization: 'Bearer wrong-secret' });
    const result = requireCronSecret(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns null when token matches CRON_SECRET', () => {
    mockVerifySecret.mockReturnValue(true);
    const req = makeReq({ authorization: `Bearer ${CRON_SECRET}` });
    const result = requireCronSecret(req);
    expect(result).toBeNull();
  });

  it('calls verifySecret with the extracted token and the env CRON_SECRET', () => {
    mockVerifySecret.mockReturnValue(true);
    const req = makeReq({ authorization: 'Bearer my-token' });
    requireCronSecret(req);
    expect(mockVerifySecret).toHaveBeenCalledWith('my-token', CRON_SECRET);
  });
});

// ------------------------------------------------------------------
// requireAdminOrCron
// ------------------------------------------------------------------

describe('requireAdminOrCron', () => {
  const CRON_SECRET = 'cron-secret-value';

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it('returns null immediately when a valid admin session exists (no Bearer required)', () => {
    mockGetAdminSession.mockReturnValue(adminSession());
    const req = makeReq(); // no Authorization header at all
    const result = requireAdminOrCron(req);
    expect(result).toBeNull();
  });

  it('returns 401 when a company session is presented (only admin sessions allowed)', () => {
    // requireAdminOrCron explicitly rejects company-role sessions
    mockGetAdminSession.mockReturnValue(companySession());
    const req = makeReq();
    const result = requireAdminOrCron(req) as Response;
    expect(result.status).toBe(401);
  });

  it('returns 401 when there is no session and no Authorization header', () => {
    mockGetAdminSession.mockReturnValue(null);
    const req = makeReq();
    const result = requireAdminOrCron(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns 401 when Authorization header has wrong format (no Bearer prefix)', () => {
    mockGetAdminSession.mockReturnValue(null);
    const req = makeReq({ authorization: 'Token bad-format' });
    const result = requireAdminOrCron(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns 503 when there is no session, has Bearer token, but CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    mockGetAdminSession.mockReturnValue(null);
    const req = makeReq({ authorization: 'Bearer some-token' });
    const result = requireAdminOrCron(req) as any;
    expect(result.status).toBe(503);
  });

  it('returns 401 when Bearer token does not match CRON_SECRET', () => {
    mockGetAdminSession.mockReturnValue(null);
    mockVerifySecret.mockReturnValue(false);
    const req = makeReq({ authorization: 'Bearer wrong-secret' });
    const result = requireAdminOrCron(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns null when Bearer token matches CRON_SECRET', () => {
    mockGetAdminSession.mockReturnValue(null);
    mockVerifySecret.mockReturnValue(true);
    const req = makeReq({ authorization: `Bearer ${CRON_SECRET}` });
    const result = requireAdminOrCron(req);
    expect(result).toBeNull();
  });

  it('does not call verifySecret when session is already valid', () => {
    mockGetAdminSession.mockReturnValue(adminSession());
    const req = makeReq({ authorization: 'Bearer some-token' });
    requireAdminOrCron(req);
    expect(mockVerifySecret).not.toHaveBeenCalled();
  });

  it('calls verifySecret with extracted token and CRON_SECRET when no session', () => {
    mockGetAdminSession.mockReturnValue(null);
    mockVerifySecret.mockReturnValue(true);
    const req = makeReq({ authorization: 'Bearer correct-secret' });
    requireAdminOrCron(req);
    expect(mockVerifySecret).toHaveBeenCalledWith('correct-secret', CRON_SECRET);
  });
});

// ------------------------------------------------------------------
// requireAdmin
// ------------------------------------------------------------------

describe('requireAdmin', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session', () => {
    mockGetAdminSession.mockReturnValue(null);
    const req = makeReq();
    const result = requireAdmin(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns 401 when session role is "company" (not admin)', () => {
    mockGetAdminSession.mockReturnValue(companySession());
    const req = makeReq();
    const result = requireAdmin(req) as any;
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Admin access required' });
  });

  it('returns null when session role is "admin"', () => {
    mockGetAdminSession.mockReturnValue(adminSession());
    const req = makeReq();
    const result = requireAdmin(req);
    expect(result).toBeNull();
  });

  it('uses "Admin access required" message for non-admin sessions', () => {
    mockGetAdminSession.mockReturnValue(companySession());
    const req = makeReq();
    const result = requireAdmin(req) as any;
    expect(result.body.error).toBe('Admin access required');
  });
});

// ------------------------------------------------------------------
// requireCompanyAuth
// ------------------------------------------------------------------

describe('requireCompanyAuth', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session (no token)', async () => {
    mockGetAdminSession.mockReturnValue(null);
    const req = makeReq();
    const result = await requireCompanyAuth(req) as any;
    expect(result.status).toBe(401);
  });

  it('returns null immediately for admin sessions without querying the database', async () => {
    mockGetAdminSession.mockReturnValue(adminSession());
    const req = makeReq();
    const result = await requireCompanyAuth(req);
    expect(result).toBeNull();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('returns 503 when DB client is not configured for company session', async () => {
    mockGetAdminSession.mockReturnValue(companySession());
    mockCreateAdminClient.mockReturnValue(null);
    const req = makeReq();
    const result = await requireCompanyAuth(req) as any;
    expect(result.status).toBe(503);
  });

  it('returns null when company session has a valid passcode in the database', async () => {
    mockGetAdminSession.mockReturnValue(companySession('acme', 'passcode-123'));
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'passcode-123' } }),
    };
    mockCreateAdminClient.mockReturnValue(mockDb);
    const req = makeReq();
    const result = await requireCompanyAuth(req);
    expect(result).toBeNull();
  });

  it('returns 401 when passcode no longer exists in the database', async () => {
    mockGetAdminSession.mockReturnValue(companySession('acme', 'passcode-123'));
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };
    mockCreateAdminClient.mockReturnValue(mockDb);
    const req = makeReq();
    const result = await requireCompanyAuth(req) as any;
    expect(result.status).toBe(401);
    expect(result.body.error).toMatch(/no longer valid/i);
  });

  it('returns null for company session without a passcodeId (skips DB check)', async () => {
    mockGetAdminSession.mockReturnValue(companySession('acme', null));
    const req = makeReq();
    const result = await requireCompanyAuth(req);
    expect(result).toBeNull();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('queries the passcodes table with the correct passcodeId', async () => {
    const session = companySession('acme', 'passcode-xyz');
    mockGetAdminSession.mockReturnValue(session);
    const mockEq = vi.fn().mockReturnThis();
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'passcode-xyz' } });
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
      maybeSingle: mockMaybeSingle,
    };
    mockCreateAdminClient.mockReturnValue(mockDb);
    const req = makeReq();
    await requireCompanyAuth(req);
    expect(mockDb.from).toHaveBeenCalledWith('passcodes');
    expect(mockDb.select).toHaveBeenCalledWith('id');
    expect(mockEq).toHaveBeenCalledWith('id', 'passcode-xyz');
  });

  it('admin session bypasses passcode validation regardless of DB state', async () => {
    mockGetAdminSession.mockReturnValue(adminSession());
    // Even if DB would return no data, admin should pass
    mockCreateAdminClient.mockReturnValue(null);
    const req = makeReq();
    const result = await requireCompanyAuth(req);
    expect(result).toBeNull();
  });
});
