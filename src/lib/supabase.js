import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
// Supabase's publishable key (sb_publishable_...). Falls back to the legacy anon
// JWT so an older .env keeps working.
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

/** False until both .env values are filled in; App renders setup instructions instead of crashing. */
export const isConfigured = Boolean(url && publishableKey)

export const supabase = isConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Needed for password-reset links, which land back here with a
        // recovery token in the URL. Harmless otherwise: normal launches from
        // the home screen have nothing in the URL to detect.
        detectSessionInUrl: true,
      },
    })
  : null
