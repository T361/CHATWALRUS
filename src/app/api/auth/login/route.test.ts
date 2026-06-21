import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- Mock all external dependencies before importing the route ----

vi.mock('@/lib/auth/session', () => ({
  isAdminAuthConfigured: vi.fn(),
  verifyAdminPasscode: vi.fn(),
  createAdminSessionToken: vi.fn(),
  createCompanySessionToken: vi.fn(),
  setAdminSessionCookie: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/perf', () => ({
  withServerTiming: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

// ---- Import mocked modules ----
import * as sessionLib from '@/lib/auth/session';
import * as supabaseAdmin from '@/lib/supabase/admin';

// ---- Import the route handler after mocks are set up ----
import { POST } from './route';

// Helpers
function makeRequest(body: unknown, contentType = 'application/json'): NextRequest {
  const req = new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
  return req;
}

function makeDbMock(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq3 = vi.fn().mockReturnValue({ maybeSingle });
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

describe('POST /api/auth/login', () => {
  const mockIsAdminAuthConfigured = vi.mocked(sessionLib.isAdminAuthConfigured);
  const mockVerifyAdminPasscode = vi.mocked(sessionLib.verifyAdminPasscode);
  const mockCreateAdminSessionToken = vi.mocked(sessionLib.createAdminSessionToken);
  const mockCreateCompanySessionToken = vi.mocked(sessionLib.createCompanySessionToken);
  const mockSetAdminSessionCookie = vi.mocked(sessionLib.setAdminSessionCookie);
  const mockCreateAdminClient = vi.mocked(supabaseAdmin.createAdminClient);

  beforeEach(() => {
    vi.clearAllMocks();
    // By default, auth is configured
    mockIsAdminAuthConfigured.mockReturnValue(true);
    mockVerifyAdminPasscode.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Auth not configured ----

  it('returns 503 when admin auth is not configured', async () => {
    mockIsAdminAuthConfigured.mockReturnValue(false);
    const req = makeRequest({ passcode: 'anything' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Admin auth not configured');
  });

  // ---- Missing passcode ----

  it('returns 400 when passcode is missing', async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Passcode required');
  });

  it('returns 400 when passcode is empty string', async () => {
    const req = makeRequest({ passcode: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Passcode required');
  });

  it('returns 400 when passcode is not a string', async () => {
    const req = makeRequest({ passcode: 12345 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Passcode required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  // ---- Admin passcode flow ----

  it('returns 200 with admin session when admin passcode matches', async () => {
    mockVerifyAdminPasscode.mockReturnValue(true);
    const fakeExpiry = new Date(Date.now() + 3600 * 1000);
    mockCreateAdminSessionToken.mockReturnValue({
      token: 'admin-token-value',
      expiresAt: fakeExpiry,
      session: { role: 'admin', issuedAt: 1000, expiresAt: 2000, companyId: null, companySlug: null },
    });

    const req = makeRequest({ passcode: 'admin-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.role).toBe('admin');
    expect(body.redirect).toBe('/');
    expect(body.expires_at).toBe(fakeExpiry.toISOString());
  });

  it('calls setAdminSessionCookie when admin login succeeds', async () => {
    mockVerifyAdminPasscode.mockReturnValue(true);
    const fakeExpiry = new Date(Date.now() + 3600 * 1000);
    mockCreateAdminSessionToken.mockReturnValue({
      token: 'admin-token-value',
      expiresAt: fakeExpiry,
      session: { role: 'admin', issuedAt: 1000, expiresAt: 2000, companyId: null, companySlug: null },
    });

    const req = makeRequest({ passcode: 'admin-passcode' });
    await POST(req);
    expect(mockSetAdminSessionCookie).toHaveBeenCalledOnce();
  });

  it('returns 503 when admin passcode matches but session token creation fails', async () => {
    mockVerifyAdminPasscode.mockReturnValue(true);
    mockCreateAdminSessionToken.mockReturnValue(null);

    const req = makeRequest({ passcode: 'admin-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Admin auth not configured');
  });

  // ---- Database not configured ----

  it('returns 503 when DB client is null', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);
    mockCreateAdminClient.mockReturnValue(null as never);

    const req = makeRequest({ passcode: 'company-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Database not configured');
  });

  // ---- Company passcode flow ----

  it('returns 401 when passcode is not found in DB', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    const dbMock = makeDbMock({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(dbMock as never);

    const req = makeRequest({ passcode: 'unknown-code' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid passcode');
  });

  it('returns 401 when DB returns an error', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    const dbMock = makeDbMock({ data: null, error: { message: 'db error' } });
    mockCreateAdminClient.mockReturnValue(dbMock as never);

    const req = makeRequest({ passcode: 'bad-code' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid passcode');
  });

  it('returns 401 when passcode record has no company_id', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    const dbMock = makeDbMock({ data: { id: '1', role: 'company', company_id: null }, error: null });
    mockCreateAdminClient.mockReturnValue(dbMock as never);

    const req = makeRequest({ passcode: 'company-no-company' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid passcode');
  });

  it('returns 200 with company session when company passcode matches', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    const passcodeData = { id: '1', role: 'company', company_id: 'cid-123', companies: { slug: 'acme-corp' } };
    const fakeExpiry = new Date(Date.now() + 3600 * 1000);

    // First DB call: passcode lookup
    const passcodeResult = { data: passcodeData, error: null };
    // Second DB call: company lookup by id
    const companyResult = { data: { slug: 'acme-corp' }, error: null };

    // We need to set up the mock to return different results for different from() calls
    let callCount = 0;
    const maybeSingle1 = vi.fn().mockResolvedValue(passcodeResult);
    const maybeSingle2 = vi.fn().mockResolvedValue(companyResult);

    const dbMock = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        const maybeSingle = callCount === 1 ? maybeSingle1 : maybeSingle2;
        const eqFn = () => ({ eq: eqFn, maybeSingle });
        return { select: () => ({ eq: eqFn }) };
      }),
    };

    mockCreateAdminClient.mockReturnValue(dbMock as never);
    mockCreateCompanySessionToken.mockReturnValue({
      token: 'company-token-value',
      expiresAt: fakeExpiry,
      session: { role: 'company', issuedAt: 1000, expiresAt: 2000, companyId: 'cid-123', companySlug: 'acme-corp' },
    });

    const req = makeRequest({ passcode: 'company-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.role).toBe('company');
    expect(body.redirect).toBe('/company/acme-corp');
  });

  it('calls createCompanySessionToken with correct companyId and slug', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    const fakeExpiry = new Date(Date.now() + 3600 * 1000);
    let callCount = 0;
    const dbMock = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        const data = callCount === 1
          ? { id: '1', role: 'company', company_id: 'cid-456', companies: { slug: 'beta-co' } }
          : { slug: 'beta-co' };
        const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
        const eqFn = () => ({ eq: eqFn, maybeSingle });
        return { select: () => ({ eq: eqFn }) };
      }),
    };

    mockCreateAdminClient.mockReturnValue(dbMock as never);
    mockCreateCompanySessionToken.mockReturnValue({
      token: 'tok',
      expiresAt: fakeExpiry,
      session: { role: 'company', issuedAt: 1000, expiresAt: 2000, companyId: 'cid-456', companySlug: 'beta-co' },
    });

    const req = makeRequest({ passcode: 'company-passcode' });
    await POST(req);

    expect(mockCreateCompanySessionToken).toHaveBeenCalledWith('cid-456', 'beta-co');
  });

  it('returns 503 when company session token creation fails', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    let callCount = 0;
    const dbMock = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        const data = callCount === 1
          ? { id: '1', role: 'company', company_id: 'cid-789', companies: { slug: 'gamma-co' } }
          : { slug: 'gamma-co' };
        const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
        const eqFn = () => ({ eq: eqFn, maybeSingle });
        return { select: () => ({ eq: eqFn }) };
      }),
    };

    mockCreateAdminClient.mockReturnValue(dbMock as never);
    mockCreateCompanySessionToken.mockReturnValue(null);

    const req = makeRequest({ passcode: 'company-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Session creation failed');
  });

  // ---- Regression: PostgREST join fix ----
  // The route now does a separate company lookup instead of relying on join data.
  // This test verifies that slug extraction works correctly via the separate query.

  it('regression: company login works when company data comes from separate query (not join)', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    const fakeExpiry = new Date(Date.now() + 3600 * 1000);
    let callCount = 0;
    const dbMock = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        // First call: passcode query — no join data (simulating no join)
        // Second call: companies query — returns object directly
        const data = callCount === 1
          ? { id: '1', role: 'company', company_id: 'cid-001' }
          : { slug: 'widget-co' }; // object, not array
        const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
        const eqFn = () => ({ eq: eqFn, maybeSingle });
        return { select: () => ({ eq: eqFn }) };
      }),
    };

    mockCreateAdminClient.mockReturnValue(dbMock as never);
    mockCreateCompanySessionToken.mockReturnValue({
      token: 'tok',
      expiresAt: fakeExpiry,
      session: { role: 'company', issuedAt: 1000, expiresAt: 2000, companyId: 'cid-001', companySlug: 'widget-co' },
    });

    const req = makeRequest({ passcode: 'company-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirect).toBe('/company/widget-co');
  });

  it('regression: returns 401 when company lookup returns null slug', async () => {
    mockVerifyAdminPasscode.mockReturnValue(false);

    let callCount = 0;
    const dbMock = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        const data = callCount === 1
          ? { id: '1', role: 'company', company_id: 'cid-002' }
          : null; // company not found
        const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
        const eqFn = () => ({ eq: eqFn, maybeSingle });
        return { select: () => ({ eq: eqFn }) };
      }),
    };

    mockCreateAdminClient.mockReturnValue(dbMock as never);

    const req = makeRequest({ passcode: 'company-passcode' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Company not found');
  });
});
