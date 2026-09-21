-- Money for everyone (docs/money-for-everyone.md): what the app needs so it fits a daily earner, a salaried
-- parent, a freelancer paid in dollars, a landlord and a wealthy household alike. One migration so it ships
-- in one push. Same lock-down as the rest of the schema: RLS on, no Data API grants; only the `api` function
-- reads and writes.

/* ------------------------------------------- 1, 4: transfers and refunds in bank imports */

alter table public.imported_transactions drop constraint imported_transactions_status_check;
alter table public.imported_transactions
  add constraint imported_transactions_status_check check (status in ('pending', 'reconciled', 'ignored', 'transfer', 'refund')),
  -- The other half of a transfer between your own accounts, or the payment a refund cancels.
  add column paired_id uuid references public.imported_transactions (id) on delete set null,
  -- The transaction a confirmed row became, so a later transfer or refund can find and correct it.
  add column transaction_id uuid references public.transactions (id) on delete set null;
create index imported_transactions_paired_idx on public.imported_transactions (paired_id);
create index imported_transactions_transaction_idx on public.imported_transactions (transaction_id);

-- Money given back on an expense. The expense keeps what it really cost; this remembers what it first was.
alter table public.transactions
  add column refunded_amount numeric(14, 2) not null default 0 check (refunded_amount >= 0);

/* ------------------------------------------- 3, 10: bills once a term, and ajo payouts */

alter table public.recurring drop constraint recurring_frequency_check;
alter table public.recurring
  add constraint recurring_frequency_check check (frequency in ('weekly', 'monthly', 'termly', 'yearly')),
  -- A contribution group (ajo, esusu): the day it's your turn, and how much you collect.
  add column payout_date date,
  add column payout_amount numeric(14, 2) check (payout_amount is null or payout_amount > 0),
  add column payout_notified_for date;

/* ------------------------------------------- 3, 8, 14: goals that save for a bill, buffers, currencies */

alter table public.goals
  -- A pot that fills up for a big bill (yearly rent, school fees) and is spent when it's due.
  add column recurring_id uuid references public.recurring (id) on delete set null,
  -- 'buffer' holds uneven income and pays a steady amount out of it each month.
  add column kind text not null default 'goal' check (kind in ('goal', 'buffer')),
  add column monthly_draw numeric(14, 2) check (monthly_draw is null or monthly_draw > 0),
  -- Null means the person's own currency. Otherwise the target is in this currency (a relocation fund in GBP).
  add column currency text check (currency is null or char_length(currency) between 3 and 5);
create index goals_recurring_idx on public.goals (recurring_id);

alter table public.goal_contributions drop constraint goal_contributions_source_check;
alter table public.goal_contributions
  add constraint goal_contributions_source_check check (source in ('manual', 'autosave', 'rollover', 'payout'));

/* ------------------------------------------- 7: paid every day */

alter table public.income_sources drop constraint income_sources_frequency_check;
alter table public.income_sources
  add constraint income_sources_frequency_check check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'irregular'));

/* ------------------------------------------- 14: money in another currency */

alter table public.transactions
  -- Income received in another currency: what arrived and the rate it was changed at. amount stays in the
  -- person's own currency so every total keeps working.
  add column fx_currency text check (fx_currency is null or char_length(fx_currency) between 3 and 5),
  add column fx_amount numeric(14, 2),
  add column fx_rate numeric(14, 4);

alter table public.profiles
  -- The rates this person uses, e.g. {"USD": 1550}. Falls back to the app's rates set by staff.
  add column fx_rates jsonb not null default '{}'::jsonb,
  -- 18: the app's language. 'pcm' is Nigerian Pidgin.
  add column language text not null default 'en' check (language in ('en', 'pcm'));

/* ------------------------------------------- 6, 13: your money, in one place */

-- Cash, wallets, accounts without a bank link, and things you own. The balance is whatever the person last
-- told us: no double entry. Linked bank accounts stay in bank_accounts and are added up alongside.
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('cash', 'bank', 'wallet', 'property', 'land', 'vehicle', 'investment', 'pension', 'crypto', 'other')),
  currency text not null default 'NGN' check (char_length(currency) between 3 and 5),
  balance numeric(16, 2) not null default 0 check (balance >= 0),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index holdings_user_space_idx on public.holdings (user_id, space_id);

/* ------------------------------------------- 5: money owed, both ways */

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  -- 'owe': you owe them. 'owed': they owe you.
  direction text not null check (direction in ('owe', 'owed')),
  person text not null check (char_length(person) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  balance numeric(14, 2) not null check (balance >= 0),
  -- Interest per month, as loan apps quote it. Only used to say which debt to clear first.
  monthly_rate numeric(6, 2) check (monthly_rate is null or monthly_rate between 0 and 100),
  due_date date,
  note text check (note is null or char_length(note) <= 200),
  reminded_for date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index debts_user_open_idx on public.debts (user_id, space_id) where closed_at is null;
create index debts_due_idx on public.debts (due_date) where closed_at is null;

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  debt_id uuid not null references public.debts (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index debt_payments_debt_idx on public.debt_payments (debt_id);
create index debt_payments_user_idx on public.debt_payments (user_id);
create index debt_payments_transaction_idx on public.debt_payments (transaction_id);

/* ------------------------------------------- 13: net worth over time */

-- One row per person per month, refreshed whenever they look. Enough to draw how it changes.
create table public.net_worth_snapshots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  have numeric(16, 2) not null default 0,
  own numeric(16, 2) not null default 0,
  owed_to_you numeric(16, 2) not null default 0,
  owe numeric(16, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

/* ------------------------------------------- 15: household staff */

alter table public.staff
  add column space_id text not null default 'business' check (space_id in ('personal', 'business'));
alter table public.payroll_runs
  add column space_id text not null default 'business' check (space_id in ('personal', 'business'));
alter table public.payroll_runs drop constraint payroll_runs_user_period_key;
alter table public.payroll_runs add constraint payroll_runs_user_space_period_key unique (user_id, space_id, period);
create index staff_user_space_idx on public.staff (user_id, space_id);

/* ------------------------------------------- 16: someone who helps with your money */

create table public.delegates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Filled in when the invite is accepted.
  delegate_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  -- 'view' sees everything and changes nothing. 'record' can also add transactions.
  role text not null check (role in ('view', 'record')),
  code text not null unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint delegates_owner_delegate_key unique (owner_id, delegate_id)
);
create index delegates_owner_idx on public.delegates (owner_id);
create index delegates_delegate_idx on public.delegates (delegate_id);

/* ------------------------------------------- 17: landlords */

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  tenant_name text check (tenant_name is null or char_length(tenant_name) <= 80),
  tenant_phone text check (tenant_phone is null or char_length(tenant_phone) <= 40),
  rent_amount numeric(14, 2) not null default 0 check (rent_amount >= 0),
  frequency text not null default 'yearly' check (frequency in ('monthly', 'quarterly', 'yearly')),
  next_due date,
  note text check (note is null or char_length(note) <= 200),
  reminded_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_user_idx on public.properties (user_id);

alter table public.transactions
  add column property_id uuid references public.properties (id) on delete set null;
create index transactions_property_idx on public.transactions (property_id) where property_id is not null;

/* ------------------------------------------- 14, 22: exchange rates and price alerts from staff */

alter table public.content_blocks drop constraint content_blocks_kind_check;
alter table public.content_blocks
  add constraint content_blocks_kind_check check (kind in ('quote', 'notification', 'guide', 'tip', 'price_alert', 'fx_rate'));

/* ------------------------------------------- timestamps */

create trigger touch_updated_at before update on public.holdings for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.debts for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.properties for each row execute function private.touch_updated_at();

/* ------------------------------------------- lockdown */

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
