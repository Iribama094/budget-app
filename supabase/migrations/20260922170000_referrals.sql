-- Invite friends (routes/referrals.ts).
--
-- Everyone gets one short code. Somebody who joined the waitlist keeps the code they had there, so the friends
-- they brought before launch still count. A friend links to whoever invited them by the code alone
-- (referred_code), not by account id: that way a friend who used a waitlist code is credited the moment the
-- waitlist person opens the app, with nothing to copy across.
--
-- A friend only counts once they have confirmed their email and recorded something, which keeps throwaway
-- sign-ups out. Whether they count is worked out when asked; referral_counted_at only records that the inviter
-- has been told, so they are told once.

alter table public.profiles
  add column referral_code text check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,16}$'),
  add column referred_code text check (referred_code is null or referred_code ~ '^[A-Z0-9]{4,16}$'),
  add column referred_at timestamptz,
  add column referral_counted_at timestamptz,
  add constraint profiles_referral_code_key unique (referral_code),
  add constraint profiles_not_self_referred check (referred_code is null or referred_code is distinct from referral_code);

create index profiles_referred_code_idx on public.profiles (referred_code) where referred_code is not null;

-- The code somebody used when they joined the waitlist, whoever it belongs to (a waitlist person or somebody
-- already in the app). It becomes their referred_code when they sign up with the same email.
alter table public.waitlist_signups
  add column invited_with text check (invited_with is null or invited_with ~ '^[A-Z0-9]{4,16}$');

-- Earlier waitlist referrals, written down the same way.
update public.waitlist_signups w
set invited_with = r.referral_code
from public.waitlist_signups r
where w.referred_by = r.id and w.invited_with is null;
