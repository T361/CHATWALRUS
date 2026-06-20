import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminSessionToken,
  createCompanySessionToken,
  isAdminAuthConfigured,
  setAdminSessionCookie,
  verifyAdminPasscode,
} from '@/lib/auth/session';
import { withServerTiming } from '@/lib/perf';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  return withServerTiming('auth.login.post', async () => {
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

    // 1. Check if it's the admin passcode
    if (verifyAdminPasscode(passcode)) {
      const sessionToken = createAdminSessionToken();
      if (!sessionToken) {
        return NextResponse.json({ error: 'Admin auth not configured' }, { status: 503 });
      }

      const response = NextResponse.json({
        authenticated: true,
        role: sessionToken.session.role,
        expires_at: sessionToken.expiresAt.toISOString(),
        redirect: '/',
      });
      setAdminSessionCookie(response, sessionToken.token, sessionToken.expiresAt);
      return response;
    }

    // 2. Check if it's a company passcode in the database
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { data: passcodeRecord, error } = await db
      .from('passcodes')
      .select('id, role, company_id, companies(slug)')
      .eq('code', passcode)
      .eq('status', 'active')
      .eq('role', 'company')
      .maybeSingle();

    if (error || !passcodeRecord || !passcodeRecord.company_id) {
      return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
    }

    // Type guard for companies relation
    const companies = passcodeRecord.companies as { slug: string } | null;
    if (!companies || !companies.slug) {
      return NextResponse.json({ error: 'Company not found' }, { status: 401 });
    }

    // 3. Create company-scoped session
    const sessionToken = createCompanySessionToken(
      passcodeRecord.company_id,
      companies.slug
    );
    if (!sessionToken) {
      return NextResponse.json({ error: 'Session creation failed' }, { status: 503 });
    }

    const response = NextResponse.json({
      authenticated: true,
      role: sessionToken.session.role,
      expires_at: sessionToken.expiresAt.toISOString(),
      redirect: `/company/${companies.slug}`,
    });
    setAdminSessionCookie(response, sessionToken.token, sessionToken.expiresAt);

    return response;
  });
}
