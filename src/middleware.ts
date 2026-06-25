import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionEdge, ADMIN_SESSION_COOKIE } from '@/lib/auth/session-edge';

// Routes that don't require authentication at middleware level.
// NOTE: individual route handlers still run their own guards (requireAdminOrCron).
const PUBLIC_PATHS = [
  '/login',            // new dedicated login page
  '/admin/settings',   // legacy login page (still accessible)
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
];

// Cron/job routes authenticate via CRON_SECRET Bearer token checked inside the
// route handler. The middleware must let them pass rather than returning 401.
const CRON_PATHS = [
  '/api/jobs/',
  '/api/admin/sync/',
  '/api/admin/passcodes',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isCronPath(pathname: string): boolean {
  return CRON_PATHS.some((p) => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.gif')
  );
}

// Constant-time comparison using HMAC — works in Edge runtime (no Node.js crypto).
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const keyMaterial = enc.encode('chatwalrus-middleware-compare');
    const key = await crypto.subtle.importKey(
      'raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const [sigA, sigB] = await Promise.all([
      crypto.subtle.sign('HMAC', key, enc.encode(a)),
      crypto.subtle.sign('HMAC', key, enc.encode(b)),
    ]);
    const arrA = new Uint8Array(sigA);
    const arrB = new Uint8Array(sigB);
    let diff = 0;
    for (let i = 0; i < arrA.length; i++) diff |= arrA[i] ^ arrB[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const startedAt = performance.now();
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Cron/sync paths: check CRON_SECRET Bearer token; fall through to session check if absent.
  if (isCronPath(pathname)) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (cronSecret && bearerToken && await timingSafeEqual(bearerToken, cronSecret)) {
      return NextResponse.next();
    }
    // No valid cron token — fall through to session check (admin can also call these)
  }

  const cookieValue = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await getAdminSessionEdge(cookieValue);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_PERF_LOGS === '1') {
    console.info('[Perf]', JSON.stringify({
      label: 'middleware.session_check',
      duration_ms: Math.round((performance.now() - startedAt) * 10) / 10,
      path: pathname,
      authenticated: !!session,
    }));
  }

  if (!session) {
    // API routes: return 401 JSON instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pages: redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    // Admin paths → land on admin tab; company paths → land on company tab
    if (!pathname.startsWith('/company/')) {
      loginUrl.searchParams.set('mode', 'admin');
    }
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(ADMIN_SESSION_COOKIE);
    return response;
  }

  // Company users: enforce access control to their company only
  if (session.role === 'company' && session.companySlug) {
    const allowedPrefix = `/company/${session.companySlug}`;

    // Company users can only access /company/{their-slug}/* and /api/companies/{slug}/*
    const isAllowedPage = pathname === allowedPrefix || pathname.startsWith(allowedPrefix + '/');
    const isAllowedApi = pathname.startsWith(`/api/companies/${session.companySlug}`);
    const isAuthApi = pathname.startsWith('/api/auth/');

    if (!isAllowedPage && !isAllowedApi && !isAuthApi) {
      // Redirect to their dashboard
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      return NextResponse.redirect(new URL(allowedPrefix, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
