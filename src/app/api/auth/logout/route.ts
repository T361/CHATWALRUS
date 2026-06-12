import { NextResponse } from 'next/server';

export async function POST() {
  // TODO: Clear session cookie when proper session management is implemented
  return NextResponse.json({ logged_out: true });
}
