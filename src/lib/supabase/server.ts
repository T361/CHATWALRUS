// =============================================================================
// Supabase Server Client (for Server Components and Route Handlers)
// =============================================================================
// Uses anon key. For admin operations, use admin.ts instead.

import { createClient } from '@supabase/supabase-js';

export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Safe version that returns null instead of throwing when env vars are missing.
 */
export function createServerClientSafe() {
  try {
    return createServerClient();
  } catch {
    console.warn('[Supabase Server] Could not create client. Database unavailable.');
    return null;
  }
}
