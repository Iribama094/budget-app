-- What a budget is for, and how each person budgets.
--   budgets.purpose: personal (someone's own plan) · household (shared and run every period) · event (one-off, like a wedding or trip)
--   profiles.budget_mode: solo · shared (one budget with others) · both (own plus shared)
--   profiles.home_budget: which budget Home shows when there's an own budget and a shared one

alter table public.budgets
  add column purpose text not null default 'personal' check (purpose in ('personal', 'household', 'event'));

-- Budgets people already share are household budgets.
update public.budgets b
set purpose = 'household'
where exists (select 1 from public.budget_members m where m.budget_id = b.id);

alter table public.profiles
  add column budget_mode text not null default 'solo' check (budget_mode in ('solo', 'shared', 'both')),
  add column home_budget text not null default 'own' check (home_budget in ('own', 'shared'));

create index budgets_user_space_purpose_start_idx on public.budgets (user_id, space_id, purpose, start_date desc);
