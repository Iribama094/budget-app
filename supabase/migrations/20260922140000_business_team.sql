-- A business owner's team: people who record and manage the business with their own login, each with one role
-- (docs/team-access.md). The business's data stays where it is, under the owner; members reach it through the
-- API, which checks every request against the role's rules. Same lock-down as the rest: RLS on, no grants.

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  -- Whose business this is. Business data is keyed by this person's id with space_id = 'business'.
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Filled in when the invite is accepted.
  member_id uuid references public.profiles (id) on delete cascade,
  -- What the owner calls them ("Tunde"), shown until they join and on everything they record.
  name text not null check (char_length(name) between 1 and 80),
  role text not null check (role in ('sales', 'purchases', 'hr', 'manager', 'accountant')),
  code text not null unique,
  -- The staff record this person is, when the invite came from Payroll.
  staff_id uuid references public.staff (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint business_members_owner_member_key unique (owner_id, member_id),
  constraint business_members_not_self check (member_id is null or member_id <> owner_id)
);
create index business_members_owner_idx on public.business_members (owner_id);
create index business_members_member_idx on public.business_members (member_id) where member_id is not null;
create index business_members_staff_idx on public.business_members (staff_id) where staff_id is not null;

-- Who recorded it. Null means the owner (everything before teams, and everything the owner records).
alter table public.transactions add column created_by uuid references public.profiles (id) on delete set null;
alter table public.invoices add column created_by uuid references public.profiles (id) on delete set null;
alter table public.supplier_bills add column created_by uuid references public.profiles (id) on delete set null;
create index transactions_created_by_idx on public.transactions (created_by) where created_by is not null;
create index invoices_created_by_idx on public.invoices (created_by) where created_by is not null;
create index supplier_bills_created_by_idx on public.supplier_bills (created_by) where created_by is not null;

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
