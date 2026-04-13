import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS.
 * Use only in server-side code (API routes, server actions).
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
