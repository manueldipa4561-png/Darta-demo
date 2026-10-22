-- Salon-only stamps for the Darta Card: a log of every stamp, the Apple Wallet devices that asked for updates,
-- and the one function that changes the count. Only the darta-wallet Edge Function (service role) touches any of it.

-- Each pass carries its own secret for Apple's web service, and a change time so devices know what to refresh.
alter table public.darta_cards add column if not exists pass_token text not null
  default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
alter table public.darta_cards add column if not exists updated_at timestamptz not null default now();

create table if not exists public.darta_stamps (
  id           bigint generated always as identity primary key,
  card_id      uuid        not null references public.darta_cards (id) on delete cascade,
  action       text        not null check (action in ('stamp', 'redeem')),
  stamps_after integer     not null check (stamps_after between 0 and 10),
  barber       text        check (barber in ('Thomas', 'Mattia', 'Rrapi')),
  created_at   timestamptz not null default now()
);
create index if not exists darta_stamps_card_idx on public.darta_stamps (card_id, created_at desc);
alter table public.darta_stamps enable row level security;
revoke all on public.darta_stamps from anon, authenticated;

-- Apple Wallet devices registered for a pass (Apple's web service protocol).
create table if not exists public.darta_pass_devices (
  device_id  text        not null check (char_length(device_id) between 1 and 128),
  card_id    uuid        not null references public.darta_cards (id) on delete cascade,
  push_token text        not null check (char_length(push_token) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (device_id, card_id)
);
create index if not exists darta_pass_devices_card_idx on public.darta_pass_devices (card_id);
alter table public.darta_pass_devices enable row level security;
revoke all on public.darta_pass_devices from anon, authenticated;

-- One stamp, or the free haircut taken (back to 0). p_code is the card id or its first 8 characters (printed under the QR).
-- result: ok | not_found | ambiguous | too_soon | card_full | not_full
create or replace function public.darta_add_stamp(p_code text, p_action text, p_barber text, p_min_gap_seconds integer)
returns table (result text, card_id uuid, stamps integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  ids  uuid[];
  c    public.darta_cards%rowtype;
  last timestamptz;
begin
  if p_code !~ '^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$' or p_action not in ('stamp', 'redeem') then
    raise exception 'bad stamp parameters';
  end if;
  -- ponytail: prefix match scans the table; fine for one salon's cards, add an index on id::text if it ever grows large
  select array_agg(d.id) into ids from (select x.id from public.darta_cards x where x.id::text like p_code || '%' limit 2) d;
  if ids is null then return query select 'not_found'::text, null::uuid, null::integer; return; end if;
  if array_length(ids, 1) > 1 then return query select 'ambiguous'::text, null::uuid, null::integer; return; end if;

  select * into c from public.darta_cards where id = ids[1] for update;   -- two scans at once cannot both count
  if p_action = 'stamp' then
    if c.stamps >= 10 then return query select 'card_full'::text, c.id, c.stamps; return; end if;
    select max(s.created_at) into last from public.darta_stamps s where s.card_id = c.id and s.action = 'stamp';
    if last is not null and last > now() - make_interval(secs => p_min_gap_seconds) then
      return query select 'too_soon'::text, c.id, c.stamps; return;
    end if;
    c.stamps := c.stamps + 1;
  else
    if c.stamps < 10 then return query select 'not_full'::text, c.id, c.stamps; return; end if;
    c.stamps := 0;
  end if;
  update public.darta_cards set stamps = c.stamps, updated_at = now() where id = c.id;
  insert into public.darta_stamps (card_id, action, stamps_after, barber) values (c.id, p_action, c.stamps, p_barber);
  return query select 'ok'::text, c.id, c.stamps;
end;
$$;

revoke all on function public.darta_add_stamp(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.darta_add_stamp(text, text, text, integer) to service_role;
