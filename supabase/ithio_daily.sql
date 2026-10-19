-- Ithio — one row per trading day, written by the krishuw bot at EOD.
--
-- Run this ONCE in the Supabase SQL Editor for project csksswotuhopqlfqilgg:
--   https://supabase.com/dashboard/project/csksswotuhopqlfqilgg/sql/new
--
-- The journal's anon (publishable) key can read/write this table, matching the
-- current journal's security posture. Auth/RLS is deliberately deferred; do
-- not put broker/API secrets in this table. If you later enable RLS, keep
-- SELECT for the journal and move the bot's INSERT/UPDATE to a service role or
-- a security-definer RPC.
--
-- The bot upserts on trade_date, so re-running a day replaces that day's row
-- (idempotent) and never double-counts.

create table if not exists public.ithio_daily (
  trade_date      date primary key,
  capital         numeric(12,2) not null default 50000,
  gross_pnl       numeric(12,2) not null default 0,
  charges         numeric(12,2) not null default 0,
  net_pnl         numeric(12,2) not null default 0,
  return_pct      numeric(10,4) not null default 0,
  wins            integer     not null default 0,
  losses          integer     not null default 0,
  source          text        not null default 'bot',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ithio_daily_date_idx
  on public.ithio_daily (trade_date desc);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.ithio_daily to anon, authenticated;
grant all on public.ithio_daily to service_role;

comment on table public.ithio_daily is
  'Ithio (SeeSaw options bot) daily EOD SUMMARY only: aggregate P&L, wins/losses, capital. No fills, order ids, candles, positions or broker data. Separate from the stock/swing/sellio portfolio and not included in portfolio totals.';
comment on column public.ithio_daily.capital is
  'Configured Ithio capital (default Rs 50,000). Constant unless the user adds funds and updates it.';
comment on column public.ithio_daily.charges is
  'Estimated charges incl. the configured safety buffer (brokerage/STT/exchange/SEBI/stamp/GST/IPFT).';
comment on column public.ithio_daily.net_pnl is
  'Gross P&L minus the buffered charge estimate.';
comment on column public.ithio_daily.return_pct is
  'net_pnl / capital * 100.';

-- PostgREST caches the schema; ask it to reload so the journal sees the table.
notify pgrst, 'reload schema';
