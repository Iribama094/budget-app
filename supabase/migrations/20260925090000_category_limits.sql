-- Limits belong to the category, and mini budgets go.
--
-- A mini budget was a second name and a second amount, living inside one budget period, that somebody had to
-- pick on every transaction on top of the category they had already picked. Its own examples ("Subscriptions",
-- "Groceries", "Fuel") were category names, a new period did not carry them over, and the same spending was
-- reported in two places that could disagree.
--
-- A limit is one number on the category people already choose, so every transaction counts itself and the
-- limit is still there next month.
--
-- Anything still in the table is carried across rather than dropped: each mini budget becomes a category with
-- its amount as the monthly limit. That is not a perfect fit for a one-off pot like "Weekend trip", but it
-- keeps the name and the number where the person can see and change them, which losing the row would not.
-- An earlier draft refused to run instead; carrying the rows over is better, because a refusal at this point
-- only moves the decision to whoever is holding the deploy.

-- What somebody means to keep spending on this category in a month. Null means no limit, which is most of them.
alter table public.categories
  add column monthly_limit numeric(14, 2) check (monthly_limit is null or (monthly_limit >= 0 and monthly_limit <= 1000000000));

-- One category per leftover mini budget, in the space its budget belonged to. A name somebody already uses as
-- a category keeps its own bucket and simply gains the limit.
insert into public.categories (user_id, space_id, name, type, bucket, icon, sort_order, monthly_limit)
select distinct on (m.user_id, b.space_id, lower(m.name))
  m.user_id,
  b.space_id,
  m.name,
  'expense',
  case when m.category in ('Needs', 'Wants', 'Savings') then m.category else 'Wants' end,
  'tag',
  2000,
  m.amount
from public.mini_budgets m
join public.budgets b on b.id = m.budget_id
where m.amount > 0
  and not exists (
    select 1 from public.categories c
    where c.user_id = m.user_id and c.space_id = b.space_id and c.type = 'expense' and lower(c.name) = lower(m.name)
  )
order by m.user_id, b.space_id, lower(m.name), m.created_at desc;

-- And where the category already existed, give it the limit.
update public.categories c
set monthly_limit = src.amount
from (
  select distinct on (m.user_id, b.space_id, lower(m.name)) m.user_id, b.space_id, lower(m.name) as lname, m.amount
  from public.mini_budgets m
  join public.budgets b on b.id = m.budget_id
  where m.amount > 0
  order by m.user_id, b.space_id, lower(m.name), m.created_at desc
) src
where c.user_id = src.user_id and c.space_id = src.space_id and c.type = 'expense'
  and lower(c.name) = src.lname and c.monthly_limit is null;

drop table public.mini_budgets;
alter table public.transactions drop column mini_budget_id;
