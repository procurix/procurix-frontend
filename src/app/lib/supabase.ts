import { createClient } from '@supabase/supabase-js';

// The frontend Supabase client. Reads the public URL and anon key from
// Vite-time env vars. The anon key is safe to expose to the browser —
// row-level security on the database is what actually gates access.
//
// We rely on the default storage (localStorage) so the session survives
// page reloads, and autoRefreshToken so silent refresh happens before a
// token expires. The fetch interceptor in services/api/legacy.ts pulls
// the current access token off this client for every API call.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Loud failure — easier to diagnose than the silent "auth doesn't work" path.
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // needed for OAuth providers later; harmless for email/password
  },
});
