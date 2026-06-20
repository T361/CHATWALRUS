import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { POINTS } from './calculatePoints';

describe('POINTS constants', () => {
  it('zoom_session = 50', () => expect(POINTS.zoom_session).toBe(50));
  it('lesson_complete = 10', () => expect(POINTS.lesson_complete).toBe(10));
  it('quiz_pass = 25', () => expect(POINTS.quiz_pass).toBe(25));
  it('course_complete = 100', () => expect(POINTS.course_complete).toBe(100));
  it('assignment = 20', () => expect(POINTS.assignment).toBe(20));
  it('survey = 15', () => expect(POINTS.survey).toBe(15));
  it('streak_7 = 50', () => expect(POINTS.streak_7).toBe(50));
  it('streak_30 = 200', () => expect(POINTS.streak_30).toBe(200));
  it('on_pace = 30', () => expect(POINTS.on_pace).toBe(30));

  it('course_complete is worth more than a single lesson', () => {
    expect(POINTS.course_complete).toBeGreaterThan(POINTS.lesson_complete);
  });

  it('streak_30 is the highest single award', () => {
    const allValues = Object.values(POINTS);
    expect(POINTS.streak_30).toBe(Math.max(...allValues));
  });
});
