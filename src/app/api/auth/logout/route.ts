import { NextResponse } from 'next/server';
import { clearAdminSessionCookie } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ logged_out: true, authenticated: false });
  clearAdminSessionCookie(response);
  return response;
}
