import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function CompanySlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(token);

  if (!session) {
    redirect('/login');
  }

  // Admins bypass passcode check
  if (session.role === 'admin') {
    return <>{children}</>;
  }

  // Company sessions: verify the passcode still exists in DB
  if (session.role === 'company' && session.passcodeId) {
    const db = createAdminClient();
    if (db) {
      const { data } = await db
        .from('passcodes')
        .select('id')
        .eq('id', session.passcodeId)
        .maybeSingle();

      if (!data) {
        // Passcode was deleted — expire this session
        redirect('/login?reason=session_expired');
      }
    }
  }

  return <>{children}</>;
}
