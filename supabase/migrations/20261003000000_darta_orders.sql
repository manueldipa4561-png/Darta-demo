-- Darta Barber Studio shop: paid orders, written only by the darta-stripe-webhook Edge Function (service role).
-- The tables of other apps in this project are untouched; everything here is prefixed darta_.

create table if not exists public.darta_orders (
  id                    uuid primary key default gen_random_uuid(),
  order_no              text not null unique check (order_no ~ '^DA-[0-9]{4}[A-Z]{2}$'),
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  status                text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
  mode                  text not null check (mode in ('pickup', 'ship')),
  currency              text not null default 'eur',
  amount_subtotal       integer not null check (amount_subtotal >= 0),
  amount_discount       integer not null default 0 check (amount_discount >= 0),
  amount_shipping       integer not null default 0 check (amount_shipping >= 0),
  amount_total          integer not null check (amount_total >= 0),
  coupon                text,
  items                 jsonb not null default '[]'::jsonb,
  customer_name         text,
  customer_email        text,
  customer_phone        text,
  shipping_address      jsonb,
  fulfilment            text not null default 'new' check (fulfilment in ('new', 'ready', 'shipped', 'picked_up', 'cancelled')),
  notified_at           timestamptz,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);

create index if not exists darta_orders_created_idx on public.darta_orders (created_at desc);

-- Orders hold customer names, emails and addresses: nobody reads them through the public API.
-- RLS is on and there are no policies, so anon and authenticated get nothing; the service role bypasses RLS.
alter table public.darta_orders enable row level security;
revoke all on public.darta_orders from anon, authenticated;
