import { createClient } from '@supabase/supabase-js'

// Server-side only — uses service role key (bypasses RLS).
// autoRefreshToken + detectSessionInUrl must be false so the auth module does not
// interfere with the bearer token for service-role requests (Supabase JS v2).
export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession:      false,
        autoRefreshToken:    false,
        detectSessionInUrl:  false,
      },
    }
  )
}
