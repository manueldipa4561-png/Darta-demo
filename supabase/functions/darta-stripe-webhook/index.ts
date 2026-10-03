// Supabase Edge Function entry point (deployed with verify_jwt off: Stripe signs its own requests).
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_..., shown by Stripe when you add this URL as a webhook endpoint) and a Stripe key that
// can read Checkout Sessions: STRIPE_READ_KEY (restricted, read-only; preferred) or STRIPE_SECRET_KEY,
// optional email to the salon: RESEND_API_KEY, ORDER_NOTIFY_TO (comma separated), ORDER_NOTIFY_FROM.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWebhook } from './handler.ts';
import type { Mail } from './handler.ts';
import { stripeFetch } from './stripe-api.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const TABLE = 'darta_orders';

const must = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

async function sendMail(mail: Mail, idempotencyKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(mail),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`email provider answered ${res.status}`);
}

Deno.serve((req) =>
  handleWebhook(req, {
    env: (k) => Deno.env.get(k),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    stripe: (key, method, path) => stripeFetch(key, method, path),
    saveOrder: async (order) => must((await db.from(TABLE).upsert(order, { onConflict: 'stripe_session_id' })).error),
    markFailed: async (id) => must((await db.from(TABLE).update({ status: 'failed' }).eq('stripe_session_id', id).neq('status', 'paid')).error),
    claimNotification: async (orderNo) => {
      const { data, error } = await db.from(TABLE).update({ notified_at: new Date().toISOString() })
        .eq('order_no', orderNo).eq('status', 'paid').is('notified_at', null).select('order_no');
      must(error);
      return (data?.length ?? 0) === 1;
    },
    releaseNotification: async (orderNo) => must((await db.from(TABLE).update({ notified_at: null }).eq('order_no', orderNo)).error),
    sendMail,
  })
);
