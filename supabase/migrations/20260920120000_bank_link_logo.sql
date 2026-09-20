-- The bank's own logo, when the provider gives us one. Banks people recognise by sight are easier to trust and
-- quicker to pick out in a list; without it the app falls back to the bank's initials in its brand colour.
alter table public.bank_links
  add column logo_url text;
