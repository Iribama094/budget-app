-- Someone who joins partway through a pay period gets a starter budget for what they have left, not a full
-- period's income they've partly spent already. tracking_start is the day they told us that amount: pace is
-- measured from it, and the next period is built from their plan instead of copying the smaller starter amount.
alter table public.budgets
  add column tracking_start date;
