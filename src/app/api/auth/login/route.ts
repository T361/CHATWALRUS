import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminSessionToken,
  createCompanySessionToken,
  isAdminAuthConfigured,
  setAdminSessionCookie,
  verifyAdminPasscode,
} from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '@/lib/auth/rateLimit';
import { withServerTiming } from '@/lib/perf';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  return withServerTiming('auth.login.post', async () => {
    const rl = checkRateLimit(req);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts — try again in ${Math.ceil(rl.retryAfterMs / 1000)}s` },
        { status: 429 }
      );
    }

    if (!isAdminAuthConfigured()) {
      return NextResponse.json({ error: 'Admin auth not configured' }, { status: 503 });
    }

    let body: { passcode?: unknown; mode?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const passcode = typeof body.passcode === 'string' ? body.passcode : '';
    const mode = body.mode === 'admin' ? 'admin' : body.mode === 'company' ? 'company' : 'admin';

    if (!passcode) {
      return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
    }

    // 1. Admin mode: only accept the admin passcode
    if (mode === 'admin') {
      if (!verifyAdminPasscode(passcode)) {
        recordFailedAttempt(req);
        return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
      }
      const sessionToken = createAdminSessionToken();
      if (!sessionToken) {
        return NextResponse.json({ error: 'Admin auth not configured' }, { status: 503 });
      }
      clearRateLimit(req);
      const response = NextResponse.json({
        authenticated: true,
        role: sessionToken.session.role,
        expires_at: sessionToken.expiresAt.toISOString(),
        redirect: '/',
      });
      setAdminSessionCookie(response, sessionToken.token, sessionToken.expiresAt);
      return response;
    }

    // 2. Company mode: only check company passcodes in the database
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { data: passcodeRecord, error } = await db
      .from('passcodes')
      .select('id, role, company_id, companies(slug)')
      .eq('code', passcode)
      .eq('status', 'active')
      .in('role', ['company', 'client'])
      .maybeSingle();

    if (error || !passcodeRecord || !passcodeRecord.company_id) {
      recordFailedAttempt(req);
      return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
    }

    // Fetch company slug separately — avoids PostgREST join type ambiguity
    const { data: company } = await db
      .from('companies')
      .select('slug')
      .eq('id', passcodeRecord.company_id)
      .maybeSingle();
    const companySlug = company?.slug;
    if (!companySlug) {
      recordFailedAttempt(req);
      return NextResponse.json({ error: 'Company not found' }, { status: 401 });
    }

    // 3. Create company-scoped session
    const sessionToken = createCompanySessionToken(
      passcodeRecord.company_id,
      companySlug,
      passcodeRecord.id
    );
    if (!sessionToken) {
      return NextResponse.json({ error: 'Session creation failed' }, { status: 503 });
    }

    clearRateLimit(req);
    const response = NextResponse.json({
      authenticated: true,
      role: sessionToken.session.role,
      expires_at: sessionToken.expiresAt.toISOString(),
      redirect: `/company/${companySlug}`,
    });
    setAdminSessionCookie(response, sessionToken.token, sessionToken.expiresAt);

    return response;
  });
}
