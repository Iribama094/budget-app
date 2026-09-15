-- Business tools and confirmable savings.
-- BudgetFriendly never moves money: every table here records what the person did (invoiced, got paid, paid a
-- supplier, paid staff, paid themselves) so reports, reminders and insights stay accurate.
-- Same lock-down as the rest of the schema: RLS on, no policies, no Data API grants.

create table public.business_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  business_name text,
  business_email text,
  business_phone text,
  business_address text,
  vat_registered boolean not null default false,
  vat_rate numeric(5, 2) not null default 7.5 check (vat_rate between 0 and 50),
  tax_set_aside_pct numeric(5, 2) not null default 10 check (tax_set_aside_pct between 0 and 60),
  runway_buffer_months numeric(4, 1) not null default 2 check (runway_buffer_months between 0 and 24),
  invoice_prefix text not null default 'INV' check (char_length(invoice_prefix) between 1 and 8),
  next_invoice_number int not null default 1,
  filing_reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  number text not null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  issue_date date not null,
  due_date date not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  status text not null default 'unpaid' check (status in ('draft', 'unpaid', 'part_paid', 'paid', 'void')),
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_user_number_key unique (user_id, number)
);
create index invoices_user_status_due_idx on public.invoices (user_id, status, due_date);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id);
create index invoice_payments_user_paid_idx on public.invoice_payments (user_id, paid_on);
create index invoice_payments_transaction_idx on public.invoice_payments (transaction_id);

create table public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'supplier' check (kind in ('supplier', 'paye', 'vat', 'other')),
  supplier_name text not null,
  description text not null default '',
  category text not null default 'Other',
  amount numeric(14, 2) not null check (amount > 0),
  amount_paid numeric(14, 2) not null default 0,
  bill_date date not null,
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'part_paid', 'paid', 'void')),
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplier_bills_user_status_due_idx on public.supplier_bills (user_id, status, due_date);

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  bill_id uuid not null references public.supplier_bills (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index bill_payments_bill_idx on public.bill_payments (bill_id);
create index bill_payments_user_idx on public.bill_payments (user_id);
create index bill_payments_transaction_idx on public.bill_payments (transaction_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  role text,
  monthly_gross numeric(14, 2) not null default 0 check (monthly_gross >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_user_idx on public.staff (user_id);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  paid_on date not null,
  lines jsonb not null default '[]'::jsonb,
  total_gross numeric(14, 2) not null default 0,
  total_paye numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  paye_bill_id uuid references public.supplier_bills (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payroll_runs_user_period_key unique (user_id, period)
);
create index payroll_runs_paye_bill_idx on public.payroll_runs (paye_bill_id);

create table public.owner_pay (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  period text not null,
  amount numeric(14, 2) not null check (amount > 0),
  suggested numeric(14, 2),
  paid_on date not null,
  business_transaction_id uuid references public.transactions (id) on delete set null,
  personal_transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index owner_pay_user_period_idx on public.owner_pay (user_id, period);
create index owner_pay_business_tx_idx on public.owner_pay (business_transaction_id);
create index owner_pay_personal_tx_idx on public.owner_pay (personal_transaction_id);

create table public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null default 'business' check (space_id in ('personal', 'business')),
  source text not null check (source in ('paystack', 'moniepoint', 'bank', 'other')),
  file_name text,
  rows_total int not null default 0,
  rows_imported int not null default 0,
  rows_duplicate int not null default 0,
  created_at timestamptz not null default now()
);
create index statement_imports_user_idx on public.statement_imports (user_id);

-- Auto-save now asks "did you move it?" before counting toward a goal.
alter table public.goal_contributions
  add column status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'skipped')),
  add column confirmed_at timestamptz,
  add column savings_transaction_id uuid references public.transactions (id) on delete set null;
create index goal_contributions_pending_idx on public.goal_contributions (user_id) where status = 'pending';
create index goal_contributions_savings_tx_idx on public.goal_contributions (savings_transaction_id);

do $$
declare
  t text;
begin
  foreach t in array array['business_settings', 'invoices', 'supplier_bills', 'staff'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
  foreach t in array array['business_settings', 'invoices', 'invoice_payments', 'supplier_bills', 'bill_payments', 'staff', 'payroll_runs', 'owner_pay', 'statement_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;
