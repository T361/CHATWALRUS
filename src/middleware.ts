import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionEdge, ADMIN_SESSION_COOKIE } from '@/lib/auth/session-edge';

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/admin/settings',   // login page
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await getAdminSessionEdge(cookieValue);

  if (session) return NextResponse.next();

  // API routes: return 401 JSON instead of redirect
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pages: redirect to login
  const loginUrl = new URL('/admin/settings', req.url);
  loginUrl.searchParams.set('redirect', pathname);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
