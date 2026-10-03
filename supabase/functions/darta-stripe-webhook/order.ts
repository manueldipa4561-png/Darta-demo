// A completed Stripe Checkout session -> an order row, and the email that tells the salon about it.

const ORDER_NO = /^DA-[A-HJKMNP-Z2-9]{7}$/;   // see ORDER_ALPHABET in darta-checkout/handler.ts

export interface OrderItem { name: string; q: number; total: number }
export interface Order {
  order_no: string; stripe_session_id: string; stripe_payment_intent: string | null;
  status: 'paid' | 'pending'; mode: 'pickup' | 'ship'; currency: string;
  amount_subtotal: number; amount_discount: number; amount_shipping: number; amount_total: number;
  coupon: string | null; items: OrderItem[];
  customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  shipping_address: Record<string, string> | null; paid_at: string | null;
}

// One line per field: a customer must not be able to forge extra lines in the plain-text email with a newline.
const text = (v: unknown, max = 200): string | null => {
  const t = typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim() : '';
  return t ? t.slice(0, max) : null;
};

/** Sessions from other things on the same Stripe account (Payment Links, another site) are not ours. */
export function isDartaSession(s: any): boolean {
  const no = text(s?.client_reference_id, 20) ?? text(s?.metadata?.order_no, 20);
  return no !== null && ORDER_NO.test(no);
}

export function orderFromSession(s: any, nowSeconds: number): Order {
  const orderNo = text(s?.client_reference_id, 20) ?? text(s?.metadata?.order_no, 20);
  if (!orderNo || !ORDER_NO.test(orderNo)) throw new Error('session has no valid order number');
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  const addr = s.shipping_details?.address;
  const mode = s.metadata?.mode === 'ship' ? 'ship' : 'pickup';
  return {
    order_no: orderNo,
    stripe_session_id: String(s.id),
    stripe_payment_intent: text(typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id, 100),
    status: paid ? 'paid' : 'pending',
    mode,
    currency: text(s.currency, 3) ?? 'eur',
    amount_subtotal: Number(s.amount_subtotal) || 0,
    amount_discount: Number(s.total_details?.amount_discount) || 0,
    amount_shipping: Number(s.total_details?.amount_shipping) || 0,
    amount_total: Number(s.amount_total) || 0,
    coupon: text(s.metadata?.coupon, 32),
    items: (s.line_items?.data ?? []).map((l: any) => ({
      name: text(l.description, 120) ?? 'Prodotto',
      q: Number(l.quantity) || 1,
      total: Number(l.amount_total) || 0,
    })),
    customer_name: text(s.customer_details?.name, 120),
    customer_email: text(s.customer_details?.email, 254),
    customer_phone: text(s.customer_details?.phone, 40),
    shipping_address: mode === 'ship' && addr
      ? {
        name: text(s.shipping_details?.name, 120) ?? '',
        line1: text(addr.line1) ?? '', line2: text(addr.line2) ?? '',
        postal_code: text(addr.postal_code, 12) ?? '', city: text(addr.city, 80) ?? '',
        state: text(addr.state, 40) ?? '', country: text(addr.country, 2) ?? '',
      }
      : null,
    paid_at: paid ? new Date(nowSeconds * 1000).toISOString() : null,
  };
}

const eur = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderEmail(o: Order): { subject: string; html: string; text: string } {
  const how = o.mode === 'ship' ? 'Spedizione' : 'Ritiro in salone';
  const a = o.shipping_address;
  const addrLines = a ? [a.name, a.line1, a.line2, `${a.postal_code} ${a.city} ${a.state}`.trim(), a.country].filter(Boolean) : [];
  const lines = [
    ...o.items.map((i) => `${i.q} x ${i.name}  ${eur(i.total)}`),
    ...(o.amount_discount ? [`Sconto${o.coupon ? ' ' + o.coupon : ''}  -${eur(o.amount_discount)}`] : []),
    ...(o.mode === 'ship' ? [`Spedizione  ${o.amount_shipping ? eur(o.amount_shipping) : 'gratis'}`] : []),
  ];
  const who = [o.customer_name, o.customer_email, o.customer_phone].filter(Boolean) as string[];

  const plain = [
    `Nuovo ordine ${o.order_no}: ${eur(o.amount_total)}`,
    `${how}${o.status === 'pending' ? ' (pagamento in attesa)' : ''}`,
    '', ...lines, `Totale  ${eur(o.amount_total)}`,
    '', ...who, ...(addrLines.length ? ['', 'Consegna a:', ...addrLines] : []),
  ].join('\n');

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px">
<h2 style="margin:0 0 4px">Nuovo ordine ${esc(o.order_no)}</h2>
<p style="margin:0 0 16px;color:#555">${esc(how)}${o.status === 'pending' ? ' &middot; pagamento in attesa' : ''}</p>
<table style="width:100%;border-collapse:collapse">${o.items.map((i) => `<tr><td style="padding:4px 0">${esc(i.q)} &times; ${esc(i.name)}</td><td style="text-align:right">${esc(eur(i.total))}</td></tr>`).join('')}
${o.amount_discount ? `<tr><td>Sconto ${esc(o.coupon)}</td><td style="text-align:right">&minus;${esc(eur(o.amount_discount))}</td></tr>` : ''}
${o.mode === 'ship' ? `<tr><td>Spedizione</td><td style="text-align:right">${o.amount_shipping ? esc(eur(o.amount_shipping)) : 'gratis'}</td></tr>` : ''}
<tr><td style="padding-top:8px;border-top:1px solid #ccc"><b>Totale</b></td><td style="text-align:right;padding-top:8px;border-top:1px solid #ccc"><b>${esc(eur(o.amount_total))}</b></td></tr></table>
<p style="margin:16px 0 0">${who.map(esc).join('<br>')}</p>
${addrLines.length ? `<p style="margin:12px 0 0"><b>Consegna a</b><br>${addrLines.map(esc).join('<br>')}</p>` : ''}
</div>`;

  return { subject: `Nuovo ordine ${o.order_no} · ${eur(o.amount_total)}`.replace(/[\r\n<>]/g, ' '), html, text: plain };
}
