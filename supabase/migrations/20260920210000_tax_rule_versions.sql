-- Tax rules that can change without a release, but not carelessly.
--
-- A wrong band changes what somebody believes they owe, so this is the one part of the console where a single
-- person cannot make a change on their own:
--   * a version starts as a draft and can be edited freely
--   * submitting it makes it pending, and it stops being editable
--   * a DIFFERENT staff member approves it, which is what makes it live
--   * the version it replaces is retired, not deleted, so a past period still reads correctly
--
-- The rules in the code stay as the fallback. An empty table means the app behaves exactly as it does today.

create table public.tax_rule_versions (
  id uuid primary key default gen_random_uuid(),
  -- 'ng' today. Lower case, matching the keys the calculator already uses.
  country text not null check (country = lower(country)),
  -- The day this version starts applying. A finance act in January is a new row, not an edit.
  effective_from date not null,
  -- The whole rule: brackets, deductions, thresholds, company tax. Same shape the code uses.
  payload jsonb not null,
  state text not null default 'draft' check (state in ('draft', 'pending', 'live', 'retired')),
  note text,
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references public.admin_users (id) on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint tax_rule_versions_country_date_key unique (country, effective_from),
  -- Nobody approves their own change. The console checks this too, but the database is the one that cannot be
  -- talked round.
  constraint tax_rule_versions_second_pair_of_eyes check (approved_by is null or approved_by <> created_by),
  constraint tax_rule_versions_live_is_approved check (state <> 'live' or approved_by is not null)
);

-- One live version per country at a time.
create unique index tax_rule_versions_live_idx on public.tax_rule_versions (country) where state = 'live';
create index tax_rule_versions_country_idx on public.tax_rule_versions (country, effective_from desc);

do $$
begin
  alter table public.tax_rule_versions enable row level security;
  revoke all on table public.tax_rule_versions from anon, authenticated;
  create trigger touch_updated_at before update on public.tax_rule_versions for each row execute function private.touch_updated_at();
end;
$$;
