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
-- Nothing is lost: before this ran, the table held 0 rows and 0 transactions pointed at one. The guard below
-- keeps that true, so this cannot quietly throw away somebody's work if it is ever run somewhere busier.

do $$
declare
  minis bigint;
  tagged bigint;
begin
  select count(*) into minis from public.mini_budgets;
  select count(*) into tagged from public.transactions where mini_budget_id is not null;
  if minis > 0 or tagged > 0 then
    raise exception 'Refusing to drop mini budgets: % rows and % tagged transactions. Move them to category limits first.', minis, tagged;
  end if;
end;
$$;

-- What somebody means to keep spending on this category in a month. Null means no limit, which is most of them.
alter table public.categories
  add column monthly_limit numeric(14, 2) check (monthly_limit is null or (monthly_limit >= 0 and monthly_limit <= 1000000000));

drop table public.mini_budgets;
alter table public.transactions drop column mini_budget_id;
