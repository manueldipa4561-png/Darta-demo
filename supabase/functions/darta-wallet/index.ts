// Supabase Edge Function entry point (verify_jwt off: the shop calls it from the browser, Origin and rate limits protect it).
// Secrets, all optional: a wallet only switches on when its whole group is set. SITE_URL is required.
//   Apple Wallet:  APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_PEM
//   Google Wallet: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_KEY
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWallet } from './handler.ts';
import type { Card } from './card.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const assets = new Map<string, Uint8Array>();   // the pictures never change while the function is warm

Deno.serve((req) =>
  handleWallet(req, {
    env: (k) => Deno.env.get(k),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    insertCard: async (card) => {
      const { data, error } = await db.from('darta_cards').insert(card).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    getCard: async (id) => {
      const { data, error } = await db.from('darta_cards').select('id, name, finish, icon, barber, stamps, lang').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Card) ?? null;
    },
    loadAsset: async (path) => {
      const hit = assets.get(path);
      if (hit) return hit;
      const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
      const res = await fetch(`${site}${path}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`${path} answered ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assets.set(path, bytes);
      return bytes;
    },
    rateLimit: async (bucket, windowS, max) => {
      const { data, error } = await db.rpc('darta_rate_limit', { p_bucket: bucket, p_window_seconds: windowS, p_max: max });
      if (error) {
        console.error('rate limiter unavailable', error.message);
        return true;
      }
      return data === true;
    },
  })
);
