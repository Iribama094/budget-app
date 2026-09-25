# Launch compliance: the site and the app

Checked 25 September 2026. Two scripts do the checking, so this can be repeated rather than remembered:

```bash
node scripts/audit-site.mjs    # the waitlist site: accessibility, consent, tracking, claims
node scripts/audit-app.mjs     # the phone app: labels, touch targets, permissions, claims
```

Both read the source and name the file and line for every finding. Both are run before a release.

## Where each item stands

| # | Item | Site | App | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Colour contrast | Done | Done | Every real colour pair measured. Lowest is 4.51 against a 4.5 minimum. Placeholder text was 3.49 and is now 5.0 |
| 2 | Alt text on images | Done | Done | Every `<img>` on all six pages has `alt`. Decorative images use `alt=""`, which is correct. In the app, images that carry meaning have an accessibility label |
| 3 | Refund policy | Done | Done | There are no payments and no card details, so there is nothing to refund. Terms say exactly that, and promise a refund policy before any paid feature exists |
| 4 | Privacy policy page | Done | Done | `waitlist/privacy.html`, linked from every page and from the sign-up form. **A lawyer has not read it** |
| 5 | Accessibility | Done | Mostly | Labels, heading order, keyboard order, language and contrast all pass. In the app, 27 small controls were given a larger touch area. See "What is left" |
| 6 | No fake reviews | Done | Done | The audit looks for review, testimonial, star rating and "trusted by" wording. There is none, because we have no users yet |
| 7 | Terms page | Done | Done | `waitlist/terms.html`, linked from every page and from the sign-up form. **A lawyer has not read it** |
| 8 | Third party embeds | Done | Done | Site: Google Fonts and Vercel's visitor counter, both named in the privacy policy. App: Mono for bank linking, WhatsApp share links, and the Mono widget's own script. No advertising or social embeds anywhere |
| 9 | Image copyright | Done | Done | Logo and generated images are ours. The four onboarding photos are from Unsplash, whose licence allows commercial use. Sources recorded below |
| 10 | Cookies policy | Done | Not needed | The site sets no cookies. The privacy policy says so, and names the three things that do touch the browser: a referral code in session storage, cookieless visitor counting, and font requests to Google |
| 11 | Tracking | Done | Done | No advertising trackers, no analytics SDK in the app, no cross-site tracking. Visitor counting is cookieless |
| 12 | Form consent | Done | Not applicable | The marketing box was ticked by default, which is not consent. It now starts empty and says that leaving it unticked still keeps your place |
| 13 | Local laws | Partly | Partly | Written for Nigeria's Data Protection Act 2023: a privacy notice, a lawful basis for each use, rights, retention, and transfers abroad named. **Registration with the regulator is still open**, see below |
| 14 | Clear button labels | Done | Done | No button anywhere is an unlabelled icon. Icon-only controls carry a spoken label |
| 15 | Cookie consent banner | Not needed | Not needed | A banner is for cookies and tracking we do not use. Adding one would be theatre |
| 16 | Real business details | **Open** | **Open** | A contact address is now in every footer. The registered company name and number are missing because they have not been supplied |
| 17 | Only necessary data | Done | Done | The waitlist asks for a first name, an email, and optionally a WhatsApp number, plus what you want the app for. The app holds what a budgeting app must. No location, no contacts, no advertising identifiers |
| 18 | Keyboard friendly forms | Done | Not applicable | Every input has a label, nothing reorders the keyboard path, and the whole form can be completed with a keyboard |
| 19 | No unsupported claims | Done | Done | The audit searches for guarantees, "bank level", user counts and star ratings. Nothing matched. The app says tax figures are estimates, not filings, and that bank links are read only |

## What is left, and who has to do it

1. **Registered business details.** Give us the company name, registration number and a registered address,
   and they go in the footer and the legal pages. Nigerian consumer and data protection rules, and both app
   stores, expect a real identifiable operator. This is the one item that cannot be finished without you.
2. **A lawyer reads the privacy policy and terms.** They are accurate to what the system does, which is the
   hard part, but they are not legal advice.
3. **Nigeria Data Protection Act.** Take advice on whether BudgetFriendly counts as a data controller of major
   importance, which would mean registering with the Nigeria Data Protection Commission and filing an annual
   audit. Holding financial data for Nigerians makes this likely rather than unlikely.
4. **Store listings.** Google's Data safety form and Apple's privacy details have to match this document. They
   are filled in when the app is submitted.
5. **Touch targets worth a second look.** The audit still lists controls whose height comes from padding
   rather than a fixed number. Those are usually fine once the text inside them is counted, but somebody
   should tap through the app on a small phone before launch.
6. **Optional: self-host the fonts.** Google Fonts means your visitors' browsers ask Google for files, which
   is a transfer abroad named in the privacy policy. Serving the two fonts ourselves removes that entirely
   and makes the site slightly faster.

## Image sources

| Image | Where it came from | Licence |
| --- | --- | --- |
| `waitlist/logo.png`, icons, `preview.png` | Made for BudgetFriendly | Ours |
| `mobile/assets/onboarding/payday.jpg` | Unsplash photo `1554224155-6726b3ff858f` | Unsplash Licence, free for commercial use, no attribution required |
| `mobile/assets/onboarding/plan.jpg` | Unsplash photo `1579621970795-87facc2f976d` | Unsplash Licence |
| `mobile/assets/onboarding/goals.jpg` | Unsplash photo `1607863680198-23d4b2565df0` | Unsplash Licence |
| `mobile/assets/onboarding/start.jpg` | Unsplash photo `1563013544-824ae1b704d3` | Unsplash Licence |
| `waitlist/instagram/*` | Made for BudgetFriendly from the above and our own type | Ours |

## What the app asks the phone for

Each permission is asked for at the moment it is needed, not at startup, and the app works without any of them.

| Permission | Why | Refusing it means |
| --- | --- | --- |
| Face ID or fingerprint | Unlocking the app without typing a password | Sign in with your password instead |
| Notifications | Bill reminders, pace alerts, security alerts | No reminders; the in-app feed still fills |
| Microphone | Saying a transaction out loud | Type it instead |
| Photos | Choosing a profile picture | No profile picture |

No location, no contacts, no calendar, no advertising identifier. Android backup of app data is off, so a
copy of somebody's money data does not leave the phone in a Google backup.
