-- Calls the API's daily job (recurring transactions, bill reminders, bank sync) at 06:00 West Africa Time.
-- The project URL and the shared cron secret are read from Vault at run time
-- (secrets `bf_project_url` and `bf_cron_secret`, created outside migrations so the secret never lands in git).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'budgetfriendly-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'bf_project_url') || '/functions/v1/api/v1/cron/daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bf_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
