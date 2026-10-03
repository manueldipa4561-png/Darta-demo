// Supabase Edge Function entry point.
// Secrets: SITE_URL (the only origin allowed to call it) and STRIPE_READ_KEY, a restricted key that can only read Checkout
// Sessions (falls back to STRIPE_SECRET_KEY). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from Supabase (rate limiter).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleOrderLookup } from './handler.ts';
import { stripeFetch } from './stripe-api.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** Counts a hit in the database. If the limiter itself is down we answer anyway. */
async function rateLimit(bucket: string, windowS: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc('darta_rate_limit', { p_bucket: bucket, p_window_seconds: windowS, p_max: max });
  if (error) {
    console.error('rate limiter unavailable', error.message);
    return true;
  }
  return data === true;
}

Deno.serve((req) =>
  handleOrderLookup(req, {
    env: (k) => Deno.env.get(k),
    stripe: (key, method, path) => stripeFetch(key, method, path),
    rateLimit,
  })
);
