-- The pre-launch waitlist, filled by the public waitlist page (waitlist/join.html) through POST /v1/waitlist.
--
-- Place in line is worked out, not stored: signups are ordered by when they joined, and every friend who joins
-- with someone's invite link moves them up REFERRAL_BOOST places (see routes/waitlist.ts). So a new referral never
-- needs a rewrite of anybody else's row.

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  -- Join order. Identity, so two signups in the same millisecond still get distinct places.
  seq bigint generated always as identity,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  first_name text not null check (char_length(first_name) between 1 and 60),
  -- National number without the leading 0 or +234, e.g. 8030000000. Optional.
  phone text check (phone is null or phone ~ '^[0-9]{7,15}$'),
  use_for text not null check (use_for in ('personal', 'business', 'both')),
  -- The same keys the app's setup flow uses: runs_out, no_idea, cant_save, debt, irregular.
  pain_points text[] not null default '{}',
  wants_updates boolean not null default true,
  -- Shared as budgetfriendly.ng/?ref=<code>. Not a secret: it only identifies who invited whom.
  referral_code text not null check (referral_code ~ '^[A-Z0-9]{4,16}$'),
  referred_by uuid references public.waitlist_signups (id) on delete set null,
  referral_count integer not null default 0 check (referral_count >= 0),
  -- Where they came from, e.g. "instagram" from ?utm_source. Free text, capped.
  source text check (source is null or char_length(source) <= 60),
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_key unique (email),
  constraint waitlist_signups_referral_code_key unique (referral_code),
  constraint waitlist_signups_seq_key unique (seq)
);

create index waitlist_signups_referred_by_idx on public.waitlist_signups (referred_by);

do $$
begin
  -- RLS on, no policies, no Data API grants: only the api function reads and writes, like every other table.
  alter table public.waitlist_signups enable row level security;
  revoke all on table public.waitlist_signups from anon, authenticated;
end;
$$;
