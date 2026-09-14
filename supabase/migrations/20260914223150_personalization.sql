-- Personalisation: answers from the first-run plan, income sources and paydays, editable categories that
-- learn from each person's history, and dismissed insights. Same lock-down as the rest of the schema:
-- RLS on, no policies, no Data API grants; only the `api` function reads and writes.

alter table public.profiles
  add column onboarding_completed_at timestamptz,
  add column onboarding_skipped_at timestamptz,
  add column pain_points text[] not null default '{}',
  add column budget_period text not null default 'payday' check (budget_period in ('payday', 'monthly'));

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('salary', 'business', 'side_hustle', 'allowance', 'other')),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  frequency text not null check (frequency in ('monthly', 'biweekly', 'weekly', 'irregular')),
  -- Day of the month for monthly pay; the next pay date for weekly or fortnightly pay.
  pay_day int check (pay_day between 1 and 31),
  next_pay_date date,
  is_estimate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index income_sources_user_idx on public.income_sources (user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'personal' check (space_id in ('personal', 'business')),
  name text not null check (char_length(name) between 1 and 40),
  type text not null check (type in ('income', 'expense')),
  bucket text check (bucket in ('Needs', 'Wants', 'Savings')),
  icon text not null default 'tag',
  is_default boolean not null default false,
  hidden boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_user_space_type_name_key on public.categories (user_id, space_id, type, lower(name));

-- "shoprite lekki" → Food & groceries: learned from the categories each person picks.
create table public.category_rules (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  pattern text not null,
  category text not null,
  bucket text check (bucket in ('Needs', 'Wants', 'Savings')),
  hits int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, type, pattern)
);

create table public.insight_dismissals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key)
);

create trigger touch_updated_at before update on public.income_sources for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.categories for each row execute function private.touch_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['income_sources', 'categories', 'category_rules', 'insight_dismissals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;
