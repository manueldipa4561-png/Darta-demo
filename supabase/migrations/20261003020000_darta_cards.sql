-- Loyalty cards added to Apple Wallet / Google Wallet. One row per card the visitor chose to add; the id is the pass serial number.
create table if not exists public.darta_cards (
  id         uuid primary key default gen_random_uuid(),
  name       text    not null check (char_length(name) between 1 and 16),
  finish     text    not null check (finish in ('onyx', 'gobetti', 'chrome', 'holo')),
  icon       text    not null check (icon in ('scissors', 'bolt', 'crown', 'fire')),
  barber     text    not null check (barber in ('Thomas', 'Mattia', 'Rrapi')),
  stamps     integer not null check (stamps between 0 and 10),
  created_at timestamptz not null default now()
);

create index if not exists darta_cards_created_idx on public.darta_cards (created_at desc);

-- The name on a card is personal data: only the Edge Function (service role) reads or writes this table.
alter table public.darta_cards enable row level security;
revoke all on public.darta_cards from anon, authenticated;
