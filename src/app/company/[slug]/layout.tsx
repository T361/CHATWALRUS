import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCompanyProvider } from '@/components/layout/AdminCompanyContext';

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

  // Admins bypass passcode check — wrap children with isAdmin=true so CompanyShell shows sidebar
  if (session.role === 'admin') {
    return <AdminCompanyProvider isAdmin={true}>{children}</AdminCompanyProvider>;
  }

  // Company sessions: verify the passcode still exists in DB
  if (session.role === 'company') {
    // Old tokens issued before passcodeId was added — force re-login to get a fresh token
    if (!session.passcodeId) {
      redirect('/login?reason=session_refresh');
    }

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

  return <AdminCompanyProvider isAdmin={false}>{children}</AdminCompanyProvider>;
}
