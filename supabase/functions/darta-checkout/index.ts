// Supabase Edge Function entry point. Secrets (set in the Supabase dashboard, never in the repo):
//   STRIPE_SECRET_KEY      sk_test_... first, sk_live_... when the client goes live (a restricted key with write access to
//                          Checkout Sessions and Coupons is enough)
//   STRIPE_WEBHOOK_SECRET  whsec_...: payments only count as "on" when the webhook that records orders can verify Stripe
//   SITE_URL               https://darta-demo.netlify.app (also the only origin allowed to call this function)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase (used only for the rate limiter).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCheckout } from './handler.ts';
import { translateCatalog } from './pricing.ts';
import type { Catalog, CatalogEn, Lang } from './pricing.ts';
import { stripeFetch } from './stripe-api.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CATALOG_TTL_MS = 60_000;
const cached = new Map<Lang, { at: number; catalog: Catalog }>();

async function fetchJson(path: string): Promise<any> {
  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
  const res = await fetch(`${site}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function loadCatalog(lang: Lang): Promise<Catalog> {
  const hit = cached.get(lang);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.catalog;
  const data = await fetchJson('/data/catalog.json');
  const ok = Array.isArray(data?.products) && data.products.every((p: any) => Number.isInteger(p?.price) && typeof p?.id === 'string')
    && Number.isInteger(data?.shipping?.flat) && Number.isInteger(data?.shipping?.freeFrom) && data?.coupons && typeof data.coupons === 'object';
  if (!ok) throw new Error('catalog has an unexpected shape');
  // English customers see English product names on Stripe's page; the prices still come from the Italian file
  const catalog = lang === 'en' ? translateCatalog(data as Catalog, (await fetchJson('/data/catalog.en.json')) as CatalogEn) : (data as Catalog);
  cached.set(lang, { at: Date.now(), catalog });
  return catalog;
}

/** Counts a hit in the database. If the limiter itself is down we let the sale through: selling matters more. */
async function rateLimit(bucket: string, windowS: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc('darta_rate_limit', { p_bucket: bucket, p_window_seconds: windowS, p_max: max });
  if (error) {
    console.error('rate limiter unavailable', error.message);
    return true;
  }
  return data === true;
}

Deno.serve((req) =>
  handleCheckout(req, {
    env: (k) => Deno.env.get(k),
    loadCatalog,
    stripe: stripeFetch,
    rateLimit,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  })
);
