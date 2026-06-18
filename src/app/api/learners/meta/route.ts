import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { getLearnerDirectoryMeta } from '@/lib/learners/directory';

export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const result = await getLearnerDirectoryMeta();
  return NextResponse.json(result);
}
