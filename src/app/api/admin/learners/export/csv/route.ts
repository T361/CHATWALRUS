import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { csvResponse } from '@/lib/exports/csv';

export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const rows: Array<{ Name: string; Email: string; Role: string; Department: string; Status: string }> = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('learners')
      .select('full_name, email, title, department, is_active')
      .eq('is_active', true)
      .order('full_name')
      .range(offset, offset + 999);

    if (error || !data || data.length === 0) break;

    for (const l of data) {
      rows.push({
        Name: l.full_name ?? '',
        Email: l.email ?? '',
        Role: l.title ?? '',
        Department: l.department ?? '',
        Status: l.is_active ? 'Active' : 'Inactive',
      });
    }

    if (data.length < 1000) break;
  }

  // Build CSV manually with explicit column order
  const headers = ['Name', 'Email', 'Role', 'Department', 'Status'];
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v;

  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h as keyof typeof r])).join(',')),
  ].join('\n');

  return csvResponse(csv, 'all-learners.csv');
}
