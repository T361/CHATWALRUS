import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { createServerClientSafe } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: passcodes, error } = await db
    .from('passcodes')
    .select('id, code, role, company_id, description, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ passcodes: passcodes || [] });
}

export async function POST(req: NextRequest) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const body = await req.json();
  const { code, role, company_id, description } = body;

  if (!code || !role) {
    return NextResponse.json({ error: 'Code and role are required' }, { status: 400 });
  }

  const { data, error } = await db
    .from('passcodes')
    .insert({ code, role, company_id: company_id || null, description: description || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ passcode: data }, { status: 201 });
}
