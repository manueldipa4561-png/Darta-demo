-- The language the visitor was reading when they added the card: the pass is written in it (Italian by default).
alter table public.darta_cards add column if not exists lang text not null default 'it' check (lang in ('it', 'en'));
