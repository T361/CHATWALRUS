import 'server-only';
// =============================================================================
// Supabase Admin Client (SERVER ONLY - uses service role key)
// =============================================================================
// WARNING: This file must NEVER be imported in client components.
// The service role key bypasses RLS and has full database access.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[Supabase Admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Admin operations require the service role key.'
    );
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

/**
 * Safe version: returns null if env vars are missing instead of throwing.
 */
export function createAdminClientSafe(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    console.warn('[Supabase Admin] Could not create admin client.');
    return null;
  }
}

/**
 * Check if admin client can be created.
 */
export function isAdminConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
