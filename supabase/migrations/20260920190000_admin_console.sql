-- The staff side of the app: who may run it, what is switched on, and a record of every change.
--
-- Money Wrapped is the reason this exists. It should be invisible except at the end of the half year and the
-- end of the year, and only once a person on the team has looked at the numbers and said they are right. That
-- is three separate conditions, so it gets its own table rather than a flag with a date squeezed into it.
--
-- Note: public.staff is already taken by business payroll (someone's employees), so the people who run
-- BudgetFriendly are admin_users.

/* ------------------------------------------------------------- who runs it */

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  -- Set the first time they sign in; the row can be created from the email alone.
  user_id uuid references public.profiles (id) on delete set null,
  email text not null unique,
  name text,
  -- owner: everything, including staff. engineer: flags, Wrapped, content. support: help one person.
  -- finance: read only.
  role text not null check (role in ('owner', 'engineer', 'support', 'finance')),
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_users (id) on delete set null,
  last_seen_at timestamptz,
  -- Kept rather than deleted, so their name still reads properly in the audit log.
  disabled_at timestamptz
);
create index admin_users_user_idx on public.admin_users (user_id) where disabled_at is null;

/* ------------------------------------------------------- what is switched on */

create table public.feature_flags (
  key text primary key,
  label text not null,
  description text,
  enabled boolean not null default false,
  -- 0 to 100. Below 100 the app decides per person from a stable hash of their id, so the same people keep
  -- the feature rather than it flickering on each launch.
  rollout_percent int not null default 100 check (rollout_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);

/* --------------------------------------------------------------- the wrapped */

create table public.wrapped_periods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('h1', 'year')),
  year int not null check (year between 2024 and 2100),
  -- building: the numbers are being written. ready: built, nobody has checked it.
  -- published: certified, and visible inside its window. hidden: pulled back.
  state text not null default 'building' check (state in ('building', 'ready', 'published', 'hidden')),
  -- The window. Outside these dates the app shows nothing, whatever the state says.
  opens_on date not null,
  closes_on date not null,
  certified_by uuid references public.admin_users (id) on delete set null,
  certified_at timestamptz,
  -- What the person checked before signing it off, for the audit log.
  note text,
  published_at timestamptz,
  built_at timestamptz,
  people_included int not null default 0,
  updated_at timestamptz not null default now(),
  constraint wrapped_periods_kind_year_key unique (kind, year),
  constraint wrapped_periods_window check (closes_on > opens_on)
);

/* ------------------------------------------------------- words, without a deploy */

create table public.content_blocks (
  key text primary key,
  kind text not null check (kind in ('quote', 'notification', 'guide', 'tip')),
  value jsonb not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);
create index content_blocks_kind_idx on public.content_blocks (kind) where enabled;

/* -------------------------------------------------------------- who did what */

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references public.admin_users (id) on delete set null,
  -- Kept as text as well, so a removed account still reads properly years later.
  admin_email text not null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_recent_idx on public.admin_audit (created_at desc);

/* ------------------------------------------------------------------ the rules */

-- Row level security on, and no Data API grants, the same as every other table: only the api function reads
-- or writes these. A person's own phone can never see the staff list or the audit log.
do $$
declare
  t text;
begin
  foreach t in array array['admin_users', 'feature_flags', 'wrapped_periods', 'content_blocks', 'admin_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['feature_flags', 'wrapped_periods', 'content_blocks'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
end;
$$;

/* ---------------------------------------------------------------- the seeds */

-- Every feature the console can reach. On by default, because they are all live today; Wrapped is the one
-- exception, and even switching it on shows nothing until a period is certified inside its window.
insert into public.feature_flags (key, label, description, enabled, rollout_percent) values
  ('money_wrapped', 'Money Wrapped', 'The half year and end of year story. Also needs a certified period inside its window.', true, 100),
  ('flux_assistant', 'Flux, the money coach', 'Answers questions and drafts entries. Each reply costs money.', true, 100),
  ('voice_entry', 'Voice entry', 'Log spending by talking. Uses paid transcription.', true, 100),
  ('bank_connections', 'Bank connections', 'Mono linking and the daily refresh.', true, 100),
  ('weekly_summary', 'Weekly summary', 'The Sunday message with the week in numbers.', true, 100),
  ('business_space', 'Business space', 'Invoices, payroll and business tax.', true, 100),
  ('shared_budgets', 'Shared budgets', 'Budgeting with a partner or housemates.', true, 100)
on conflict (key) do nothing;

-- The windows people expect: the half year from 1 July, the year from 20 December into January. Both start
-- hidden. Nothing shows until someone certifies them.
insert into public.wrapped_periods (kind, year, state, opens_on, closes_on) values
  ('h1', 2026, 'hidden', '2026-07-01', '2026-08-01'),
  ('year', 2026, 'hidden', '2026-12-20', '2027-02-01')
on conflict (kind, year) do nothing;
