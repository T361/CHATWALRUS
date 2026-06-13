import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const db = createAdminClient();

  const { data: surveys, error } = await db
    .from('surveys')
    .select('*, companies(name), learners(full_name), courses(name)')
    .order('submitted_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (surveys || []).map((s) => ({
    id: s.id,
    rating: s.rating,
    feedback_text: s.feedback_text,
    proficiency_level: s.proficiency_level,
    submitted_at: s.submitted_at,
    company_name: (s as Record<string, unknown>).companies
      ? ((s as Record<string, unknown>).companies as Record<string, string>).name
      : null,
    learner_name: (s as Record<string, unknown>).learners
      ? ((s as Record<string, unknown>).learners as Record<string, string>).full_name
      : null,
    course_name: (s as Record<string, unknown>).courses
      ? ((s as Record<string, unknown>).courses as Record<string, string>).name
      : null,
  }));

  const ratings = items.filter((s) => s.rating !== null).map((s) => s.rating as number);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  return NextResponse.json({
    surveys: items,
    average_rating: avgRating,
    total_responses: items.length,
  });
}
