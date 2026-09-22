-- Proving somebody owns the email address they signed up with.
--
-- Sign-up does not check it (the project auto-confirms, because its built-in mailer cannot reach real inboxes),
-- so anyone can register somebody else's address. Nothing about their money is at risk from that, but every
-- email the app sends to the account would land on a stranger who never signed up: a spam and phishing channel
-- with our name on it. So the API sends a six-digit code through Brevo, and until it comes back the account
-- gets no email except that code and password resets, and cannot invite anybody.
--
-- Whether an address is verified lives in auth.users app_metadata (email_verified_at), which only the server
-- can write. Codes are stored hashed, one live code per account.

create table public.email_verifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now()
);

alter table public.email_verifications enable row level security;
-- No policies and no grants: only the API, connecting as the database owner, reads or writes codes.
revoke all on table public.email_verifications from anon, authenticated;

-- Everybody who signed up before this existed has been using the app with that address all along. Asking them
-- to prove it now would lock real people out of their own money for no gain, so they start verified.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('email_verified_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
where not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'email_verified_at');

-- A new address has to be proved all over again.
create or replace function public.forget_email_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'email_verified_at';
  end if;
  return new;
end;
$$;

revoke all on function public.forget_email_verification() from public, anon, authenticated;

create trigger forget_email_verification
  before update of email on auth.users
  for each row execute function public.forget_email_verification();
