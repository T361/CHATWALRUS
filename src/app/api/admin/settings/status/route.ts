import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, isAdminAuthConfigured } from '@/lib/auth/session';
import { isThinkificConfigured } from '@/lib/thinkific/client';
import { isZoomConfigured } from '@/lib/zoom/client';
import { isAdminConfigured as isSupabaseAdminConfigured } from '@/lib/supabase/admin';

interface ProbeResult {
  connected: boolean;
  status: number | null;
  message: string | null;
}

async function probeSupabase(
  key: string | undefined,
  table: string
): Promise<ProbeResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !key) {
    return {
      connected: false,
      status: null,
      message: 'Missing Supabase URL or key',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let message: string | null = null;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message || parsed.error || null;
    } catch {
      message = text || null;
    }

    return {
      connected: response.ok,
      status: response.status,
      message,
    };
  } catch (error) {
    return {
      connected: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeThinkific(): Promise<ProbeResult> {
  const apiKey = process.env.THINKIFIC_API_KEY;
  const subdomain = process.env.THINKIFIC_SUBDOMAIN;
  const baseUrl = process.env.THINKIFIC_BASE_URL || 'https://api.thinkific.com/api/public/v1';

  if (!apiKey || !subdomain) {
    return {
      connected: false,
      status: null,
      message: 'Missing Thinkific API key or subdomain',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/courses?limit=1&page=1`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let message: string | null = null;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.error || parsed.message || null;
    } catch {
      message = text || null;
    }

    return {
      connected: response.ok,
      status: response.status,
      message,
    };
  } catch (error) {
    return {
      connected: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [supabasePublic, supabaseAdmin, thinkific] = await Promise.all([
    probeSupabase(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'companies'),
    probeSupabase(process.env.SUPABASE_SERVICE_ROLE_KEY, 'companies'),
    probeThinkific(),
  ]);

  return NextResponse.json({
    auth: {
      authenticated: !!session,
      configured: isAdminAuthConfigured(),
      role: session?.role ?? null,
      expires_at: session ? new Date(session.expiresAt * 1000).toISOString() : null,
    },
    integrations: {
      supabase: {
        configured: !!(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ),
        admin_configured: isSupabaseAdminConfigured(),
        public_probe: supabasePublic,
        admin_probe: supabaseAdmin,
      },
      thinkific: {
        configured: isThinkificConfigured(),
        probe: thinkific,
      },
      zoom: {
        configured: isZoomConfigured(),
      },
      slack: {
        configured: !!process.env.SLACK_BOT_TOKEN,
      },
    },
  });
}
