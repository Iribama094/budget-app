-- Business tools, second pass. Three of these change figures people file with the tax office:
--   * withholding tax, so an invoice a customer deducted tax from can actually settle
--   * VAT paid on costs, so the VAT to remit is not overstated
--   * a record of what has been filed, so a deadline stops nagging once it is done
-- The rest remove daily retyping: saved customers, and payroll deductions for real payslips.

/* ------------------------------------------------------------ withholding tax */

alter table public.business_settings
  -- Nigerian customers commonly withhold 5% on services and 10% on some categories. Set once, editable per payment.
  add column wht_rate numeric(5, 2) not null default 5 check (wht_rate between 0 and 30);

alter table public.invoices
  -- Tax the customer kept back and paid to the tax office on this business's behalf.
  add column wht_amount numeric(14, 2) not null default 0 check (wht_amount >= 0);

alter table public.invoice_payments
  add column wht_amount numeric(14, 2) not null default 0 check (wht_amount >= 0);

/* ------------------------------------------------------------------- input VAT */

alter table public.transactions
  -- VAT inside a business cost. Claimed back against the VAT collected on sales.
  add column vat_amount numeric(14, 2) not null default 0 check (vat_amount >= 0);

/* --------------------------------------------------------------- filing status */

create table public.tax_filings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('vat', 'paye', 'cit')),
  -- 'YYYY-MM' for VAT and PAYE, 'YYYY' for company income tax.
  period text not null check (period ~ '^\d{4}(-\d{2})?$'),
  amount numeric(14, 2) not null default 0,
  filed_at timestamptz not null default now(),
  note text,
  constraint tax_filings_user_kind_period_key unique (user_id, kind, period)
);
create index tax_filings_user_idx on public.tax_filings (user_id, kind, period);

/* ------------------------------------------------------------------ customers */

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_user_name_idx on public.customers (user_id, name);

alter table public.invoices
  -- Kept alongside the typed name, so existing invoices and one-off customers still work.
  add column customer_id uuid references public.customers (id) on delete set null;
create index invoices_customer_idx on public.invoices (customer_id);

-- Every invoice already written becomes a customer, so nobody starts with an empty list.
insert into public.customers (user_id, name, phone, email)
select distinct on (i.user_id, lower(i.customer_name))
  i.user_id, i.customer_name, i.customer_phone, i.customer_email
from public.invoices i
where coalesce(trim(i.customer_name), '') <> ''
order by i.user_id, lower(i.customer_name), i.created_at desc;

update public.invoices i
set customer_id = c.id
from public.customers c
where c.user_id = i.user_id and lower(c.name) = lower(i.customer_name) and i.customer_id is null;

/* ------------------------------------------------- payroll deductions, payslips */

alter table public.staff
  add column pension_enabled boolean not null default false,
  add column pension_rate numeric(5, 2) not null default 8 check (pension_rate between 0 and 20),
  add column nhf_enabled boolean not null default false;

alter table public.payroll_runs
  add column total_pension numeric(14, 2) not null default 0,
  add column total_nhf numeric(14, 2) not null default 0;

/* --------------------------------------------------------------------- lockdown */

-- Same as every other migration that adds tables: row level security on, no Data API grants.
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
