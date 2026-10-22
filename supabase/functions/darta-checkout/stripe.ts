// Builds the Checkout Session and coupon requests for Stripe.
import type { PlanQuote, Quote } from './pricing.ts';
import type { Param } from './stripe-api.ts';

const SESSION_LIFETIME_S = 3600;
const SALON = 'Via Gobetti 184, Pescara';

// what the customer reads on Stripe's page, per language
const TEXT = {
  it: {
    pickup: `Ritiro gratuito in salone: ${SALON}, da martedì a sabato 10:00-19:00. Ti scriviamo quando è pronto.`,
    ship: 'Il salone prepara il pacco e ti scrive con il tracking.',
    shipFree: 'Spedizione gratuita',
    shipStandard: 'Spedizione standard',
    back: '/shop#carrello',
    done: '/ordine',
    plan: 'Si rinnova ogni mese allo stesso prezzo finché non disdici. Disdici quando vuoi dal link nell’email di Stripe: resta attivo fino alla fine del mese pagato.',
    planBack: '/#abbonamenti',
  },
  en: {
    pickup: `Free pickup at the studio: ${SALON}, Tuesday to Saturday, 10am to 7pm. We'll message you when it's ready.`,
    ship: 'The studio will pack your order and send you the tracking number.',
    shipFree: 'Free shipping',
    shipStandard: 'Standard shipping',
    back: '/en/shop#cart',
    done: '/en/order',
    plan: 'Renews every month at the same price until you cancel. Cancel any time from the link in Stripe’s email: it stays active until the end of the paid month.',
    planBack: '/en/#abbonamenti',
  },
} as const;

/** A one-off fixed-amount coupon with exactly the discount we computed (Checkout has no negative lines). */
export function couponParams(q: Quote, now: number): { [key: string]: Param } | null {
  if (!q.discount) return null;
  return {
    redeem_by: now + SESSION_LIFETIME_S + 600, // outlives the session by a few minutes, then it is dead
    amount_off: q.discount,
    currency: 'eur',
    duration: 'once',
    max_redemptions: 1,
    name: q.couponLabel.slice(0, 40) || q.coupon,
    metadata: { code: q.coupon },
  };
}

export interface SessionContext {
  siteUrl: string;
  orderNo: string;
  now: number;
  couponId?: string;
  withImages?: boolean;
}

export function sessionParams(q: Quote, ctx: SessionContext) {
  const ship = q.mode === 'ship';
  const text = TEXT[q.lang];
  return {
    mode: 'payment',
    locale: q.lang,
    submit_type: 'pay',
    client_reference_id: ctx.orderNo,
    success_url: `${ctx.siteUrl}${text.done}?s={CHECKOUT_SESSION_ID}`, // Stripe fills the placeholder in
    cancel_url: `${ctx.siteUrl}${text.back}`,
    expires_at: ctx.now + SESSION_LIFETIME_S,
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
    line_items: q.items.map((i) => ({
      quantity: i.q,
      price_data: {
        currency: 'eur',
        unit_amount: i.unit,
        product_data: {
          name: i.name,
          images: ctx.withImages ? [`${ctx.siteUrl}/img/p/${i.slug}-a.webp`] : undefined,
        },
      },
    })),
    discounts: ctx.couponId ? [{ coupon: ctx.couponId }] : undefined,
    shipping_address_collection: ship ? { allowed_countries: ['IT'] } : undefined,
    shipping_options: ship
      ? [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: q.shipping === 0 ? text.shipFree : text.shipStandard,
          fixed_amount: { amount: q.shipping, currency: 'eur' },
        },
      }]
      : undefined,
    custom_text: {
      submit: {
        message: ship ? text.ship : text.pickup,
      },
    },
    metadata: { order_no: ctx.orderNo, mode: q.mode, lang: q.lang, coupon: q.coupon || undefined },
    payment_intent_data: { description: `Darta Shop ${ctx.orderNo}`, metadata: { order_no: ctx.orderNo } },
  };
}

/** A monthly Darta membership: Stripe charges the first month now and renews it by itself until the customer cancels. */
export function planSessionParams(p: PlanQuote, ctx: SessionContext) {
  const text = TEXT[p.lang];
  return {
    mode: 'subscription',
    locale: p.lang,
    client_reference_id: ctx.orderNo, // same DA- number as a shop order, so the webhook and the thank-you page treat it alike
    success_url: `${ctx.siteUrl}${text.done}?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${ctx.siteUrl}${text.planBack}`,
    expires_at: ctx.now + SESSION_LIFETIME_S,
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
    line_items: [{
      quantity: 1,
      price_data: { currency: 'eur', unit_amount: p.total, recurring: { interval: 'month' }, product_data: { name: p.name } },
    }],
    custom_text: { submit: { message: text.plan } },
    metadata: { order_no: ctx.orderNo, mode: 'plan', plan: p.id, lang: p.lang },
    subscription_data: { description: `${p.name} ${ctx.orderNo}`, metadata: { order_no: ctx.orderNo, plan: p.id } },
  };
}
