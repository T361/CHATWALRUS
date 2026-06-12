import { NextResponse } from 'next/server';
import { createServerClientSafe } from '@/lib/supabase/server';

export async function GET() {
  const db = createServerClientSafe();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { data, error } = await db
    .from('companies')
    .select('id, name, slug, start_date, end_date, is_active, last_synced_at')
    .eq('is_active', true)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companies: data || [] });
}
