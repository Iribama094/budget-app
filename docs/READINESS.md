# BudgetFriendly: launch readiness

Written 22 September 2026. An honest account of what is verified, what is not, what the owner has to do, and what it costs. Prices are list prices as best known on this date; **check each provider's pricing page before paying**, as they change.

## Verdict: not ready to launch yet

The backend and staff console are in good shape and verified. The phone app has **never been built for a store, never been run from a production build, and has no automated UI tests**, so it cannot honestly be certified. Several launch essentials are also missing: email sending, push notifications, backups, a privacy policy and terms.

| Area | State | Evidence |
| --- | --- | --- |
| API and database | **Ready** | About 259 end-to-end checks against the live project, covering personal and business money, business teams, sharing, cross-account isolation for 10 kinds of data, sign-in, recovery, devices and email confirmation. The last run on API v39 had 256 passes and 3 momentary gateway errors that passed on rerun; the suite now retries a dropped connection once. Security advisor clean except one dashboard setting |
| Security hardening | **Ready**, with owner actions | Staff MFA verified with throwaway accounts; audit log proved append-only; Data API refuses table access. Password strength still needs one dashboard switch |
| Staff console | **Ready** once the owner sets up an authenticator | Every page's endpoint returns correctly; live bundle matches the build |
| Phone app | **Not verified** | Type-checks cleanly, and screens have been tried in Expo Go during development. Never built as an APK or IPA; no UI tests; not tested on a range of phones; iOS never built |
| Email | **Not working** | `BREVO_API_KEY` is not set, so no email is sent: no password reset codes, no sign-up codes, no alerts |
| Push notifications | **Not working** | No Expo project ID, so phones get no push token. Alerts show only in the in-app feed |
| Bank linking (Mono) | **Unknown** | A key is set; whether it is a test or live key, and whether a live agreement exists, is for the owner to confirm |
| Backups | **Unknown, likely none** | Depends on the Supabase plan. The Free plan has none |
| Legal | **Missing** | Sign-up says "you agree to our Terms and Privacy Policy", but neither exists |
| Tax figures | **Not professionally reviewed** | Built from the Nigeria Tax Act 2025 and published summaries; labelled as estimates in the app |
| Monitoring | **None** | No error tracking or alerts; failures are only seen in logs when someone looks |
| Load | **Untested** | No load testing has been done |

## What the owner needs to do

Ordered by what blocks launch first.

### Must do before anyone outside the team uses it

1. **Turn email on.** In Brevo: create a v3 API key (starts with `xkeysib-`), and verify a sender address or, better, your domain (Brevo gives DNS records to add). Then set both secrets:
   ```bash
   npx supabase secrets set BREVO_API_KEY=xkeysib-... EMAIL_FROM="BudgetFriendly <hello@your-domain>"
   ```
   Or hand the key over and ask for it to be set. Password resets, the sign-up code and alerts start working at once, with no deploy.
2. **Supabase dashboard, Authentication:** set password requirements to "Letters and digits". Turn on leaked password protection if your plan offers it.
3. **Staff console:** sign in and set up the authenticator app when asked. Keep that phone safe; if it is lost, remove the factor under Authentication, Users, then set it up again.
4. **Write a Privacy Policy and Terms**, publish them on your website, and link them from the sign-up screen and the store listings. Both stores require a privacy policy URL. Nigeria's Data Protection Act 2023 applies because the app holds personal and financial data; take advice on whether you must register with the Nigeria Data Protection Commission.
5. **Make the app installable without your laptop** (EAS; see below). This is also what makes push notifications work.
6. **Confirm Mono:** live key, signed agreement, and a test with a real account.
7. **Test on real phones:** at least one cheap Android, one recent Android and, if launching on iOS, one iPhone. Walk through sign-up, plan set-up, adding transactions, a bank link, business invoices and Wrapped.

### Should do before real money data builds up

8. **Upgrade Supabase to Pro** for daily backups (and no pausing for inactivity).
9. **Move the web projects to Vercel Pro** once BudgetFriendly makes money: the Hobby plan's terms are for non-commercial use.
10. **Add error tracking** (for example Sentry's free tier) to the app and API.
11. **Have a tax professional review** the Nigerian tax rules in the staff console.
12. **Domain and email records:** point your domain at the website, add `admin.` for the console if wanted, and add SPF, DKIM and DMARC records so email does not land in spam.

### Store listings

13. Google Play Console account and, for iOS, an Apple Developer account.
14. Store listing: name, descriptions, screenshots, icon, category, content rating, Google's Data safety form and Apple's privacy details.

### Housekeeping

15. The main checkout on the laptop (`Downloads/Budget-Friendly-app`) has fallen behind GitHub. Once nobody else is working in it, run `git status` there, keep anything that matters, then `git fetch` and `git reset --hard origin/main`. The reset discards local changes, so check first.
16. Delete the old MongoDB backend (`api/`, `backend/`, `server/`) and its database when it is no longer needed for reference.

## Making the app installable (EAS)

Today the app only runs through Expo Go while the laptop serves it. Expo Application Services fixes that:

- **EAS Build** makes a real Android app (APK for testers, AAB for Google Play) and an iOS build for TestFlight and the App Store. Once installed, the app talks to Supabase directly; the laptop is out of the picture.
- **EAS Update** sends JavaScript changes to installed apps without a store review.
- Creating the EAS project adds the project ID the app needs for push notifications.

Needed from the owner: an Expo account (free), the Google Play and Apple accounts above, and the app's final name, icon and bundle identifiers (currently `com.budgetfriendly.app`).

## Costs

### One-off

| Item | Cost | Needed? |
| --- | --- | --- |
| Google Play developer account | US$25, once | Yes, for Android |
| Privacy policy and terms | Free to a lawyer's fee | Yes |
| NDPC registration or audit | Depends on how many people's data you hold | Take advice |

### Yearly

| Item | Cost | Needed? |
| --- | --- | --- |
| Apple Developer Program | US$99 a year | Only for iOS |
| Domain (for example budgetfriendly.ng) | Roughly ₦10,000 to ₦30,000 a year, by registrar | Yes, for email sending and the website |

### Monthly

| Service | Free tier | Paid tier | When you need paid |
| --- | --- | --- | --- |
| **Supabase** (API, database, sign-in) | US$0: 500 MB database, 50,000 monthly users, no backups, pauses after a week without activity | **Pro, US$25 a month**: 8 GB, 100,000 monthly users, 7 days of daily backups | Before real users' money is in it |
| **Vercel** (console, website) | US$0, Hobby: non-commercial use | Pro, US$20 per team member a month | Once it is a business |
| **Expo EAS** (builds, updates, push) | US$0: a limited number of builds a month in a slower queue; updates for a limited number of monthly users | Starter about US$19 a month; more above that | When the free build count or update users run out |
| **Brevo** (email) | US$0: 300 emails a day | Starter from about US$9 a month | When sign-ups and alerts pass 300 a day |
| **Groq** (Flux, voice) | Free tier with rate limits | Pay as you go, per token | When Flux use grows |
| **Mono** (bank linking) | Test mode is free | Priced per linked account or call; ask Mono | For live bank linking |
| **Sentry** (error tracking) | US$0 developer plan | From about US$26 a month | Rarely at the start |
| **Expo push notifications** | Free | Free | |

### What it adds up to

| Stage | Monthly | Plus |
| --- | --- | --- |
| **Testing with friends** (today's setup, Android APK) | US$0 | US$25 once for Play, when you publish |
| **Public launch, Android only, sensible** | About US$45 to US$55 (Supabase Pro, Vercel Pro, Brevo free) | US$25 once, domain yearly |
| **Public launch, Android and iOS** | Same, about US$45 to US$55 | US$25 once, US$99 a year, domain yearly |
| **Growing** (thousands of active people) | About US$75 to US$150, driven by Brevo volume, EAS and Mono | |

Mono and any AI usage are the costs that grow with use; everything else is flat until you reach tens of thousands of people.

## What "done" will look like

The app can be called launch-ready when every line below is true:

- [ ] Email configured and a reset code and sign-up code received on a real inbox
- [ ] Password requirements set in the dashboard
- [ ] Staff authenticator set up
- [ ] Privacy policy and terms published and linked
- [ ] Android build installed from EAS and walked through on at least two real phones
- [ ] Push notification received on a real phone
- [ ] Mono live linking tried with a real account
- [ ] Supabase on a plan with backups
- [ ] Error tracking in place
- [ ] Tax rules reviewed by a professional
- [ ] (iOS) TestFlight build walked through on an iPhone
- [ ] End-to-end suite passing on the release build's API version
