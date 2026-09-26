-- Coaching, or just keeping score.
--
-- What is safe to spend used to be the money left divided by the days left, worked out fresh every morning.
-- That number can never tell anybody off: spend today's 10,000 and tomorrow still offers about 9,900, because
-- going over is spread thinly across every day that is left. A month can drain with nothing ever reading wrong.
--
-- 'coach', the default, fixes the number for the day and counts it down as you spend. Going over comes off
-- tomorrow by exactly that much and says so. 'flowing' keeps the older behaviour for anybody who finds being
-- held to a day stressful. The app asks nobody to choose: it is one switch in Settings.

alter table public.profiles
  add column spend_style text not null default 'coach' check (spend_style in ('coach', 'flowing'));

comment on column public.profiles.spend_style is
  'coach: today has a fixed amount and what is not spent, or overspent, carries to tomorrow by name. flowing: the money left is re-divided across the days left each morning.';

-- Starting the day count again, on purpose.
--
-- Under coaching, going over yesterday comes off today. Sometimes that is the wrong answer: the month really
-- did change, and carrying a debt from a week ago only discourages. "Re-spread what's left" takes the money
-- still to come and divides it across the days still left, from that day on. The plan itself is untouched, and
-- it happens because somebody asked for it, not because they spent.
alter table public.budgets add column spread_from date;

comment on column public.budgets.spread_from is
  'Set when somebody chooses to re-spread what is left. The day-by-day figures count from here instead of the start of the period.';
