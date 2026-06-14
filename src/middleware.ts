import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/auth/session';

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/admin/settings',   // login page (passcode form lives here)
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
  // /api/admin/settings/status is intentionally NOT here — it requires auth
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg')
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = getAdminSession(req);
  if (session) return NextResponse.next();

  // API routes: return 401 JSON instead of redirect
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pages: redirect to login
  const loginUrl = new URL('/admin/settings', req.url);
  loginUrl.searchParams.set('redirect', pathname);
  const response = NextResponse.redirect(loginUrl);
  // Clear any stale session cookie
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
