import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: passcodes, error } = await db
    .from('passcodes')
    .select('id, role, company_id, description, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ passcodes: passcodes || [] });
}

export async function POST(req: NextRequest) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const body = await req.json();
  const { code, role, company_id, description } = body;

  if (!code || !role) {
    return NextResponse.json({ error: 'Code and role are required' }, { status: 400 });
  }

  // Check for duplicate passcode within the same company
  const { data: existing } = await db
    .from('passcodes')
    .select('id')
    .eq('code', code)
    .eq('company_id', company_id || null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'A passcode with this code already exists for this company' },
      { status: 409 }
    );
  }

  const { data, error } = await db
    .from('passcodes')
    .insert({ code, role, company_id: company_id || null, description: description || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ passcode: data }, { status: 201 });
}
