// Cart validation and pricing. The browser sends only product ids, variants and quantities:
// every price below comes from data/catalog.json, so nobody can pay a price they typed themselves.
// The rules mirror js/store.js (tests/pricing.test.mjs checks both give the same totals).

export interface Variant { id: string; label: string; price: number }
export interface Product {
  id: string; slug: string; name: string; price: number;
  variants?: Variant[]; digital?: boolean; recurring?: unknown;
}
export interface Catalog {
  shipping: { flat: number; freeFrom: number };
  coupons: Record<string, { pct: number; label: string }>;
  products: Product[];
}

export type Mode = 'pickup' | 'ship';
export type Lang = 'it' | 'en';
export interface Line { id: string; v: string; q: number }
export interface Cart { lines: Line[]; coupon: string; mode: Mode; lang: Lang }
export interface QuoteItem { id: string; slug: string; name: string; unit: number; q: number }
export interface Quote {
  items: QuoteItem[]; mode: Mode; lang: Lang; coupon: string; couponLabel: string;
  subtotal: number; discount: number; shipping: number; total: number;
}
export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

const MAX_LINES = 20;
const MAX_QTY = 9;
const MIN_CHARGE = 500; // 5 EUR: Stripe's floor is 0.50, but tiny amounts are what card-testing bots probe with (cheapest product: 13 EUR)
const ID = /^[a-z0-9-]{1,32}$/;
const VARIANT = /^[a-z0-9-]{0,32}$/;
const COUPON = /^[A-Z0-9_-]{0,32}$/;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const cents = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

export function parseCart(body: unknown): Result<Cart> {
  if (!body || typeof body !== 'object') return fail('bad_cart');
  const { lines, coupon = '', mode = 'pickup', lang = 'it' } = body as Record<string, unknown>;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) return fail('bad_cart');
  if (mode !== 'pickup' && mode !== 'ship') return fail('bad_cart');
  if (lang !== 'it' && lang !== 'en') return fail('bad_cart');
  if (typeof coupon !== 'string' || !COUPON.test(coupon.trim().toUpperCase())) return fail('bad_cart');

  const merged: Line[] = [];
  for (const raw of lines) {
    if (!raw || typeof raw !== 'object') return fail('bad_cart');
    const { id, v = '', q } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !ID.test(id)) return fail('bad_cart');
    if (typeof v !== 'string' || !VARIANT.test(v)) return fail('bad_cart');
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_QTY) return fail('bad_cart');
    const same = merged.find((l) => l.id === id && l.v === v);
    if (same) same.q = Math.min(MAX_QTY, same.q + q);
    else merged.push({ id, v, q });
  }
  return { ok: true, value: { lines: merged, coupon: coupon.trim().toUpperCase(), mode, lang } };
}

export function quote(catalog: Catalog, cart: Cart): Result<Quote> {
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const items: QuoteItem[] = [];

  for (const line of cart.lines) {
    const p = byId.get(line.id);
    if (!p) return fail('unknown_product');
    if (p.digital || p.recurring) return fail('digital_unsupported');
    let unit = p.price;
    let name = p.name;
    if (p.variants) {
      const v = p.variants.find((x) => x.id === line.v);
      if (!v) return fail('bad_variant');
      if (!cents(v.price)) return fail('bad_catalog');
      unit = v.price;
      name = `${p.name} ${v.label}`;
    } else if (line.v) {
      return fail('bad_variant');
    }
    if (!cents(unit)) return fail('bad_catalog');
    items.push({ id: p.id, slug: p.slug, name, unit, q: line.q });
  }

  let pct = 0;
  let couponLabel = '';
  if (cart.coupon) {
    // Object.hasOwn keeps "constructor" and "__proto__" from being valid codes
    const c = Object.hasOwn(catalog.coupons, cart.coupon) ? catalog.coupons[cart.coupon] : null;
    if (!c) return fail('bad_coupon');
    if (!Number.isFinite(c.pct) || c.pct < 0 || c.pct > 100) return fail('bad_catalog');
    pct = c.pct;
    couponLabel = c.label;
  }

  if (!cents(catalog.shipping?.flat) || !cents(catalog.shipping?.freeFrom)) return fail('bad_catalog');
  const subtotal = items.reduce((s, i) => s + i.unit * i.q, 0);
  const discount = Math.round((subtotal * pct) / 100);
  const goods = subtotal - discount; // free shipping is earned after the discount
  const shipping = cart.mode === 'ship' ? (goods >= catalog.shipping.freeFrom ? 0 : catalog.shipping.flat) : 0;
  const total = goods + shipping;
  if (!Number.isFinite(total) || total < MIN_CHARGE) return fail('below_minimum');

  return { ok: true, value: { items, mode: cart.mode, lang: cart.lang, coupon: cart.coupon, couponLabel, subtotal, discount, shipping, total } };
}

/** The English copy of data/catalog.en.json laid over the catalog. Only names and labels are taken: prices always come from the Italian file. */
export interface CatalogEn {
  coupons?: Record<string, { label?: string }>;
  products?: Record<string, { name?: string; variants?: { id: string; label: string }[] }>;
}
export function translateCatalog(cat: Catalog, en: CatalogEn): Catalog {
  return {
    ...cat,
    coupons: Object.fromEntries(Object.entries(cat.coupons).map(([k, c]) => [k, { ...c, label: en.coupons?.[k]?.label ?? c.label }])),
    products: cat.products.map((p) => {
      const o = en.products?.[p.id];
      if (!o) return p;
      return {
        ...p,
        name: o.name ?? p.name,
        variants: p.variants?.map((v) => ({ ...v, label: o.variants?.find((x) => x.id === v.id)?.label ?? v.label })),
      };
    }),
  };
}
