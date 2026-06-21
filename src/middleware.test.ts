import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- Mock session-edge before importing middleware ----
vi.mock('@/lib/auth/session-edge', () => ({
  ADMIN_SESSION_COOKIE: 'chatwalrus_admin_session',
  getAdminSessionEdge: vi.fn(),
}));

import * as sessionEdge from '@/lib/auth/session-edge';
import { middleware } from './middleware';

const mockGetAdminSessionEdge = vi.mocked(sessionEdge.getAdminSessionEdge);

function makeRequest(pathname: string, options: {
  cookieValue?: string;
  authHeader?: string;
} = {}): NextRequest {
  const url = `http://localhost${pathname}`;
  const headers: Record<string, string> = {};
  if (options.authHeader) {
    headers['authorization'] = options.authHeader;
  }
  const req = new NextRequest(url, { headers });
  if (options.cookieValue) {
    // NextRequest cookies are read-only; we need to set them via the headers
    Object.defineProperty(req, 'cookies', {
      get: () => ({
        get: (name: string) => name === 'chatwalrus_admin_session' ? { value: options.cookieValue } : undefined,
      }),
    });
  }
  return req;
}

const ADMIN_SESSION = {
  role: 'admin' as const,
  issuedAt: 1000,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  companyId: null,
  companySlug: null,
};

const COMPANY_SESSION = {
  role: 'company' as const,
  issuedAt: 1000,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  companyId: 'cid-123',
  companySlug: 'acme-corp',
};

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  // ---- Static assets ----

  it('passes through _next/ paths without auth check', async () => {
    const req = makeRequest('/_next/static/chunk.js');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    // Should call next() (no redirect, no 401)
    expect(res.status).toBe(200);
  });

  it('passes through favicon paths', async () => {
    const req = makeRequest('/favicon.ico');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes through .png paths', async () => {
    const req = makeRequest('/logo.png');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  // ---- Public paths ----

  it('passes through /login without auth check', async () => {
    const req = makeRequest('/login');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes through /admin/settings without auth check', async () => {
    const req = makeRequest('/admin/settings');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes through /api/auth/login without auth check', async () => {
    const req = makeRequest('/api/auth/login');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes through /api/auth/logout without auth check', async () => {
    const req = makeRequest('/api/auth/logout');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes through /api/auth/session without auth check', async () => {
    const req = makeRequest('/api/auth/session');
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  // ---- Unauthenticated requests ----

  it('returns 401 JSON for unauthenticated API requests', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(null);
    const req = makeRequest('/api/companies/acme/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('redirects unauthenticated page requests to /login', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(null);
    const req = makeRequest('/company/acme-corp');
    const res = await middleware(req);
    expect(res.status).toBe(307); // redirect
    const location = res.headers.get('location');
    expect(location).toContain('/login');
  });

  it('includes redirect param in login redirect', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(null);
    const req = makeRequest('/company/acme-corp/learners');
    const res = await middleware(req);
    const location = res.headers.get('location');
    expect(location).toContain('redirect=');
    // The redirect value is URL-encoded in the query string
    const locationUrl = new URL(location!);
    expect(locationUrl.searchParams.get('redirect')).toBe('/company/acme-corp/learners');
  });

  // ---- Authenticated admin requests ----

  it('passes through any path for authenticated admin', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(ADMIN_SESSION);
    const req = makeRequest('/api/companies/acme/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('admin can access any company route', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(ADMIN_SESSION);
    const req = makeRequest('/company/any-company/learners');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('admin can access admin routes', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(ADMIN_SESSION);
    const req = makeRequest('/admin/users');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  // ---- Company session access control ----

  it('allows company user to access their own company page', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/company/acme-corp/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('allows company user to access their own company API', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/api/companies/acme-corp/learners');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('allows company user to access auth API', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/api/auth/session');
    const res = await middleware(req);
    // /api/auth/ is public, so it never reaches session check
    expect(res.status).toBe(200);
  });

  it('blocks company user from accessing another company page', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/company/other-company/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307); // redirect to their own page
    const location = res.headers.get('location');
    expect(location).toContain('/company/acme-corp');
  });

  it('blocks company user from accessing another company API', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/api/companies/other-company/learners');
    const res = await middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Access denied');
  });

  it('blocks company user from accessing admin routes', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/admin/settings');
    // /admin/settings is public, so middleware passes through
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('company user is redirected to their own dashboard when accessing wrong page', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(COMPANY_SESSION);
    const req = makeRequest('/some-other-page');
    const res = await middleware(req);
    // Not an API, so should redirect to their company page
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/company/acme-corp');
  });

  // ---- Cron paths ----

  it('passes through cron paths with valid Bearer token', async () => {
    process.env.CRON_SECRET = 'my-cron-secret';
    const req = makeRequest('/api/jobs/daily-thinkific-sync', {
      authHeader: 'Bearer my-cron-secret',
    });
    const res = await middleware(req);
    // Should pass through (no session check needed for valid cron)
    expect(mockGetAdminSessionEdge).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('falls through to session check for cron path with wrong Bearer token', async () => {
    process.env.CRON_SECRET = 'my-cron-secret';
    mockGetAdminSessionEdge.mockResolvedValue(null);
    const req = makeRequest('/api/jobs/daily-thinkific-sync', {
      authHeader: 'Bearer wrong-secret',
    });
    const res = await middleware(req);
    // Invalid cron token falls through to session check, no session → 401
    expect(mockGetAdminSessionEdge).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it('falls through to session check for cron path with no auth header', async () => {
    process.env.CRON_SECRET = 'my-cron-secret';
    mockGetAdminSessionEdge.mockResolvedValue(ADMIN_SESSION);
    const req = makeRequest('/api/admin/sync/core');
    const res = await middleware(req);
    // No bearer token → falls through to session check
    expect(mockGetAdminSessionEdge).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('falls through to session check when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    mockGetAdminSessionEdge.mockResolvedValue(null);
    const req = makeRequest('/api/jobs/sync-zoom-attendance', {
      authHeader: 'Bearer some-token',
    });
    const res = await middleware(req);
    expect(mockGetAdminSessionEdge).toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  // ---- Session cookie parsing ----

  it('passes cookie value to getAdminSessionEdge', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(ADMIN_SESSION);
    const req = makeRequest('/api/companies/test/dashboard', {
      cookieValue: 'my-session-token',
    });
    await middleware(req);
    expect(mockGetAdminSessionEdge).toHaveBeenCalledWith('my-session-token');
  });

  it('passes undefined to getAdminSessionEdge when no cookie', async () => {
    mockGetAdminSessionEdge.mockResolvedValue(null);
    const req = makeRequest('/api/companies/test/dashboard');
    await middleware(req);
    expect(mockGetAdminSessionEdge).toHaveBeenCalledWith(undefined);
  });
});
