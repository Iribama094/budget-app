-- Notifications belong to a space so the Business space shows business alerts and Personal shows personal ones.
-- A null space_id means the notification is about the whole account (for example security) and shows in both.

alter table public.notifications
  add column space_id text check (space_id in ('personal', 'business'));

-- Backfill: business tools first, then anything linked to a budget takes that budget's space.
update public.notifications
set space_id = 'business'
where data ->> 'screen' in ('InvoiceDetail', 'Invoices', 'InvoiceEdit', 'Bills', 'BusinessTax', 'PayYourself', 'BusinessReports', 'Payroll', 'StatementImport');

update public.notifications n
set space_id = b.space_id
from public.budgets b
where n.space_id is null
  and n.data ->> 'budgetId' = b.id::text;

update public.notifications
set space_id = 'personal'
where space_id is null
  and kind <> 'security';

create index notifications_user_space_created_idx on public.notifications (user_id, space_id, created_at desc);
