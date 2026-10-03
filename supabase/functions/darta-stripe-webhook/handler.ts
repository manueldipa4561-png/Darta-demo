// POST /darta-stripe-webhook: Stripe tells us a Checkout session was paid. Only Stripe may call this (signature check).
import { isDartaSession, orderFromSession, renderEmail } from './order.ts';
import { fetchSessionWithItems } from './stripe-api.ts';
import type { Order } from './order.ts';
import { verifyStripeSignature } from './signature.ts';

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9_]{8,200}$/;
const MAX_BODY = 512 * 1024;

export interface Mail { from: string; to: string[]; subject: string; html: string; text: string }
export interface WebhookDeps {
  env: (key: string) => string | undefined;
  nowSeconds: () => number;
  stripe: (key: string, method: 'GET' | 'POST', path: string) => Promise<any>;
  saveOrder: (order: Order) => Promise<void>;
  markFailed: (sessionId: string) => Promise<void>;
  /** true only for the first caller: keeps a retried webhook from emailing the salon twice */
  claimNotification: (orderNo: string) => Promise<boolean>;
  releaseNotification: (orderNo: string) => Promise<void>;
  /** idempotencyKey makes a retry after a timeout safe: the mail provider sends the same message only once */
  sendMail: (mail: Mail, idempotencyKey: string) => Promise<void>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const webhookSecret = deps.env('STRIPE_WEBHOOK_SECRET');
  // Only reads sessions: a restricted read-only key is enough (falls back to the main key)
  const secretKey = deps.env('STRIPE_READ_KEY') ?? deps.env('STRIPE_SECRET_KEY');
  if (!webhookSecret || !secretKey) return json(503, { error: 'not_configured' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return json(413, { error: 'too_large' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
  const valid = await verifyStripeSignature(raw, req.headers.get('stripe-signature'), webhookSecret, deps.nowSeconds());
  if (!valid) return json(400, { error: 'bad_signature' });

  let event: any;
  try { event = JSON.parse(raw); } catch { return json(400, { error: 'bad_json' }); }
  const type = String(event?.type ?? '');
  const sessionId = event?.data?.object?.id;

  const paidTypes = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  if (!paidTypes.includes(type) && type !== 'checkout.session.async_payment_failed') return json(200, { received: true });
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return json(200, { received: true, ignored: 'no_session' });

  try {
    if (type === 'checkout.session.async_payment_failed') {
      await deps.markFailed(sessionId);
      return json(200, { received: true });
    }

    // Never trust the event body for money: ask Stripe for the session itself.
    const session = await fetchSessionWithItems(deps.stripe, secretKey, sessionId);
    // Not ours (a Payment Link, another site on the same Stripe account): acknowledge, or Stripe would retry for days
    if (!isDartaSession(session)) return json(200, { received: true, ignored: 'not_darta' });
    // The event time stays the same on every redelivery, so paid_at does not move when Stripe retries
    const order = orderFromSession(session, Number(event.created) || deps.nowSeconds());
    await deps.saveOrder(order);

    const to = (deps.env('ORDER_NOTIFY_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const from = deps.env('ORDER_NOTIFY_FROM');
    if (order.status === 'paid' && to.length && from && deps.env('RESEND_API_KEY')) {
      if (await deps.claimNotification(order.order_no)) {
        try {
          await deps.sendMail({ from, to, ...renderEmail(order) }, `darta-${order.order_no}`);
        } catch (err) {
          await deps.releaseNotification(order.order_no); // let Stripe's retry try again
          throw err;
        }
      }
    }
    return json(200, { received: true });
  } catch (err) {
    console.error('webhook failed', type, sessionId, String(err));
    return json(500, { error: 'processing_failed' });
  }
}
