-- BudgetFriendly schema.
-- The app never talks to these tables directly: every read and write goes through the `api`
-- Edge Function, which connects as the database owner. RLS is enabled with no policies and the
-- Data API roles have no grants, so the tables are unreachable from public clients.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/* ------------------------------------------------------------------ profiles */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  currency text,
  locale text,
  monthly_income numeric(14, 2),
  tax_profile jsonb,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Creates the profile when someone signs up, and keeps the email in step with Auth.
create or replace function private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, name)
    values (
      new.id,
      coalesce(new.email, ''),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '')
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, ''), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user();

/* ------------------------------------------------------------------ budgets */

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  name text not null,
  total_budget numeric(14, 2) not null default 0,
  period text not null check (period in ('monthly', 'weekly')),
  start_date date not null,
  end_date date,
  categories jsonb not null default '{}'::jsonb,
  rollover jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index budgets_user_space_start_idx on public.budgets (user_id, space_id, start_date desc);

create table public.budget_members (
  budget_id uuid not null references public.budgets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  joined_at timestamptz not null default now(),
  primary key (budget_id, user_id)
);
create index budget_members_user_idx on public.budget_members (user_id);

create table public.budget_invites (
  code text primary key,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz
);
create index budget_invites_budget_idx on public.budget_invites (budget_id);
create index budget_invites_invited_by_idx on public.budget_invites (invited_by);
create index budget_invites_accepted_by_idx on public.budget_invites (accepted_by);

create table public.mini_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  name text not null,
  amount numeric(14, 2) not null default 0,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mini_budgets_budget_idx on public.mini_budgets (budget_id, created_at desc);
create index mini_budgets_user_idx on public.mini_budgets (user_id);

/* ------------------------------------------------------------------ goals */

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  name text not null,
  target_amount numeric(14, 2) not null,
  current_amount numeric(14, 2) not null default 0,
  target_date date not null,
  emoji text,
  color text,
  category text,
  auto_save_percent numeric(5, 2) check (auto_save_percent is null or (auto_save_percent >= 0 and auto_save_percent <= 50)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_space_idx on public.goals (user_id, space_id, created_at desc);

/* ------------------------------------------------------------------ recurring */

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null,
  description text not null default '',
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  anchor_day int,
  next_due_date date not null,
  end_date date,
  auto_create boolean not null default true,
  remind_days_before int not null default 1 check (remind_days_before between 0 and 14),
  budget_category text,
  paused boolean not null default false,
  last_created_for date,
  last_reminded_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_user_idx on public.recurring (user_id, paused, next_due_date);
create index recurring_due_idx on public.recurring (next_due_date) where not paused;

/* ------------------------------------------------------------------ transactions */

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null,
  description text not null default '',
  budget_id uuid references public.budgets (id) on delete set null,
  budget_category text,
  -- Kept as text: older clients send a mini-budget name here.
  mini_budget_id text,
  -- Client-generated id so offline retries never create duplicates.
  client_id text,
  recurring_id uuid references public.recurring (id) on delete set null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_user_client_key unique (user_id, client_id)
);
create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc, id desc);
create index transactions_budget_idx on public.transactions (budget_id, type, occurred_at);
create index transactions_recurring_idx on public.transactions (recurring_id);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  amount numeric(14, 2) not null,
  source text not null check (source in ('manual', 'autosave', 'rollover')),
  transaction_id uuid references public.transactions (id) on delete set null,
  budget_id uuid references public.budgets (id) on delete set null,
  created_at timestamptz not null default now()
);
create index goal_contributions_user_idx on public.goal_contributions (user_id);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);
create index goal_contributions_transaction_idx on public.goal_contributions (transaction_id);
create index goal_contributions_budget_idx on public.goal_contributions (budget_id);

/* ------------------------------------------------------------------ banks */

create table public.bank_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  provider text not null,
  bank_name text not null,
  user_name text,
  email text,
  phone text,
  external_account_id text,
  status text not null default 'active' check (status in ('active', 'reauth_required')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_links_user_external_key unique (user_id, external_account_id)
);
create index bank_links_provider_sync_idx on public.bank_links (provider, last_synced_at);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  bank_link_id uuid not null references public.bank_links (id) on delete cascade,
  name text not null,
  mask text not null,
  type text not null,
  currency text not null,
  balance numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bank_accounts_link_idx on public.bank_accounts (bank_link_id);
create index bank_accounts_user_idx on public.bank_accounts (user_id);

create table public.imported_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  bank_name text not null,
  bank_account_name text not null,
  amount numeric(14, 2) not null,
  currency text not null,
  direction text not null check (direction in ('debit', 'credit')),
  description text not null default '',
  merchant text not null default '',
  occurred_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'reconciled', 'ignored')),
  -- Provider transaction id, unique per user, so syncs are idempotent.
  external_id text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imported_transactions_user_external_key unique (user_id, external_id)
);
create index imported_transactions_user_status_idx on public.imported_transactions (user_id, status, occurred_at desc);
create index imported_transactions_account_idx on public.imported_transactions (bank_account_id);

/* ------------------------------------------------------------------ notifications */

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- One row per de-duplicated alert ("userId:dedupeKey"); a live row means it was already sent.
create table public.alert_log (
  key text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index alert_log_user_idx on public.alert_log (user_id);
create index alert_log_expires_idx on public.alert_log (expires_at);

create table public.rate_limits (
  key text primary key,
  count int not null,
  expires_at timestamptz not null
);
create index rate_limits_expires_idx on public.rate_limits (expires_at);

/* ------------------------------------------------------------------ devices */

-- Friendly device names for Auth sessions, shown on the "Signed-in devices" screen.
create table public.device_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_name text,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index device_sessions_user_idx on public.device_sessions (user_id);

/* ------------------------------------------------------------------ housekeeping */

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'budgets', 'mini_budgets', 'goals', 'recurring', 'transactions',
    'bank_links', 'bank_accounts', 'imported_transactions', 'push_tokens'
  ] loop
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      t
    );
  end loop;
end;
$$;

-- Lock every table: RLS on, no policies, no Data API grants.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
