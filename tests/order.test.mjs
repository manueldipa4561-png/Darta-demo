// Turning a paid Stripe session into an order row and a safe notification email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isDartaSession, orderFromSession, renderEmail } from '../supabase/functions/darta-stripe-webhook/order.ts';

const session = (over = {}) => ({
  id: 'cs_test_abc123',
  payment_status: 'paid',
  payment_intent: 'pi_123',
  client_reference_id: 'DA-K7M3QX9',
  currency: 'eur',
  amount_subtotal: 5400,
  amount_total: 4890,
  total_details: { amount_discount: 540, amount_shipping: 490 },
  metadata: { order_no: 'DA-K7M3QX9', mode: 'ship', coupon: 'BENVENUTO10' },
  customer_details: { name: 'Mario Rossi', email: 'mario@example.com', phone: '+393331112222' },
  shipping_details: { name: 'Mario Rossi', address: { line1: 'Via Roma 1', postal_code: '65100', city: 'Pescara', state: 'PE', country: 'IT' } },
  line_items: { data: [
    { description: 'Wax Powder', quantity: 2, amount_total: 4000 },
    { description: 'Olio Barba', quantity: 1, amount_total: 1400 },
  ] },
  ...over,
});

test('maps a paid session to an order row', () => {
  const o = orderFromSession(session(), 1_800_000_000);
  assert.equal(o.order_no, 'DA-K7M3QX9');
  assert.equal(o.stripe_session_id, 'cs_test_abc123');
  assert.equal(o.status, 'paid');
  assert.equal(o.mode, 'ship');
  assert.equal(o.amount_total, 4890);
  assert.equal(o.amount_discount, 540);
  assert.equal(o.amount_shipping, 490);
  assert.equal(o.coupon, 'BENVENUTO10');
  assert.deepEqual(o.items, [{ name: 'Wax Powder', q: 2, total: 4000 }, { name: 'Olio Barba', q: 1, total: 1400 }]);
  assert.equal(o.customer_email, 'mario@example.com');
  assert.equal(o.shipping_address.city, 'Pescara');
  assert.equal(o.paid_at, new Date(1_800_000_000 * 1000).toISOString());
});

test('delayed payment methods stay pending until Stripe says paid', () => {
  const o = orderFromSession(session({ payment_status: 'unpaid' }), 1_800_000_000);
  assert.equal(o.status, 'pending');
  assert.equal(o.paid_at, null);
});

test('pickup orders have no address and a missing mode defaults to pickup', () => {
  const o = orderFromSession(session({ shipping_details: null, metadata: { order_no: 'DA-K7M3QX9' } }), 1);
  assert.equal(o.mode, 'pickup');
  assert.equal(o.shipping_address, null);
});

test('sessions without an order number are refused', () => {
  assert.throws(() => orderFromSession(session({ client_reference_id: null, metadata: {} }), 1));
  assert.throws(() => orderFromSession(session({ client_reference_id: 'bad number', metadata: {} }), 1));
  assert.throws(() => orderFromSession(session({ client_reference_id: 'DA-1234AB', metadata: {} }), 1)); // the old 6-character shape is gone
  assert.throws(() => orderFromSession(session({ client_reference_id: 'DA-0OIL111', metadata: {} }), 1)); // ambiguous characters are not in the alphabet
});

test('the notification email escapes everything a customer typed', () => {
  const evil = '<img src=x onerror=alert(1)>"&';
  const o = orderFromSession(session({
    customer_details: { name: evil, email: 'a@b.it', phone: evil },
    shipping_details: { name: evil, address: { line1: evil, postal_code: '1', city: evil, state: '', country: 'IT' } },
    line_items: { data: [{ description: evil, quantity: 1, amount_total: 100 }] },
  }), 1);
  const mail = renderEmail(o);
  assert.ok(!mail.html.includes('<img'), 'raw tag leaked into html');
  assert.ok(mail.html.includes('&lt;img'));
  assert.ok(!mail.subject.includes('<'));
  assert.match(mail.subject, /DA-K7M3QX9/);
  assert.match(mail.text, /Wax Powder|<img/); // plain text keeps the characters as typed
});

test('the email says pickup or shipping and lists the total in euros', () => {
  const ship = renderEmail(orderFromSession(session(), 1));
  assert.match(ship.text, /Spedizione/);
  assert.match(ship.text, /48,90/);
  const pick = renderEmail(orderFromSession(session({ shipping_details: null, metadata: { order_no: 'DA-K7M3QX9', mode: 'pickup' } }), 1));
  assert.match(pick.text, /Ritiro in salone/);
});

test('sessions that are not Darta orders are recognised', () => {
  assert.equal(isDartaSession(session()), true);
  assert.equal(isDartaSession(session({ client_reference_id: null, metadata: { order_no: 'DA-K7M3QX9' } })), true);
  assert.equal(isDartaSession(session({ client_reference_id: null, metadata: {} })), false);
  assert.equal(isDartaSession(session({ client_reference_id: 'PL-123', metadata: {} })), false);
  assert.equal(isDartaSession(null), false);
});

test('newlines typed by a customer cannot forge lines in the plain-text email', () => {
  const o = orderFromSession(session({ customer_details: { name: 'Mario\nTotale  0,01 €\r\nSpedizione gratis', email: 'a@b.it', phone: null } }), 1);
  assert.ok(!o.customer_name.includes('\n') && !o.customer_name.includes('\r'));
  const mail = renderEmail(o);
  assert.equal(mail.text.split('\n').filter((l) => l.startsWith('Totale')).length, 1);
});
