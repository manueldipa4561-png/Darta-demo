-- After the security review: longer order numbers, safer default status, and a small rate limiter for the public endpoints.

-- Order numbers are now DA- plus 7 characters from a 31-symbol alphabet (no 0/O, 1/I/L); the table is still empty.
alter table public.darta_orders drop constraint if exists darta_orders_order_no_check;
alter table public.darta_orders add constraint darta_orders_order_no_check check (order_no ~ '^DA-[A-HJKMNP-Z2-9]{7}$');
-- A row inserted by hand or by a future code path is not paid until something says so.
alter table public.darta_orders alter column status set default 'pending';

-- Hits per bucket and time window. Buckets are short hashes of a visitor's IP or a global name, never the address itself.
create table if not exists public.darta_rate_hits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);
alter table public.darta_rate_hits enable row level security;
revoke all on public.darta_rate_hits from anon, authenticated;

-- true = allowed. Counts one hit and answers false once more than p_max happened in the current window.
create or replace function public.darta_rate_limit(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  w timestamptz;
  n integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'bad rate limit parameters';
  end if;
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.darta_rate_hits as r (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  if random() < 0.02 then   -- tidy up now and then; no scheduler needed
    delete from public.darta_rate_hits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end;
$$;

-- Only the Edge Functions (service role) may call it: it is not part of the public API.
revoke all on function public.darta_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.darta_rate_limit(text, integer, integer) to service_role;
