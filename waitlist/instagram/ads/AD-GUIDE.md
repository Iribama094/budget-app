# Running BudgetFriendly waitlist ads on Instagram

Everything in this folder is sized and written for Meta Ads Manager (which runs Instagram ads). Start small, let the numbers pick the winners, then put money behind them.

## What's in the kit

| File | Where it runs | Size |
| --- | --- | --- |
| `carousel-card-1.png` to `carousel-card-6.png` | Feed carousel ad | 1080×1080 (1:1). Meta recommends square cards for carousels and crops 4:5 ones |
| `single-ad-a.png` (the pain), `single-ad-b.png` (the number), `single-ad-c.png` (the question) | Feed single-image ads, tested against each other | 1080×1350 (4:5) |
| `../../../brag-output-2026-09-21-155223/budgetfriendly-reels-ad.mp4` | Reels and Stories ads | 1080×1920, 19s, narrated, subtitled |
| `../slide-1.png` to `../slide-8.png` | Your organic (unpaid) carousel post | 1080×1350 |
| `../../../brag-output-2026-09-21-155223/budgetfriendly-social.mp4` | Organic Reel | 1080×1920, 1:31, narrated |

The Reels ad keeps all text and the phone out of the top 270px and bottom 670px, where Instagram puts the profile name, caption and the ad's own button.

## 1. Pick the campaign type

**Recommended: Leads, with an Instant Form.** People join without leaving Instagram, and their name and email are already filled in from their profile. That means cheaper signups and more of them.

**Also run: Traffic or Leads to your website** (`waitlist/index.html` once it's hosted). It costs more per signup, but people who fill in the page are more serious. Running both side by side is a common way to get volume and quality at once.

Instant Form setup:
- Form type: **More volume**
- Questions: Full name, Email (prefilled), and one optional multiple-choice question: "What will you use BudgetFriendly for?" with "My own money", "My business", "Both"
- Privacy policy: **required by Meta**. You need a public privacy policy link before the form can go live
- Thank-you screen: "You're on the list! We'll message you the moment it's your turn." Button: "Visit website", pointing to your waitlist page

Instant Form signups land in Meta, not in your database. Download them from Ads Manager, or connect them later so they go into the same waitlist table as the website.

## 2. Copy to paste (inside Meta's limits)

**Primary text** (the first 125 characters show before "more"):

1. Salary land on the 25th, finished by the 9th? BudgetFriendly shows what's safe to spend every day. Join the waitlist.
2. Know exactly what you can spend today, so your money lasts until payday. Free to join the BudgetFriendly waitlist.
3. Your bank logs your spending. We never move your money. See what's safe to spend, every morning. Join the waitlist.

**Headline** (under 27 characters): "Money that lasts to payday" · "Join the free waitlist" · "Know today's safe spend"

**Carousel card headlines** (one per card, under 27 characters):
1. Salary gone by the 9th?
2. Know today's safe spend
3. Needs, wants, savings
4. Read-only bank import
5. Personal and business
6. Join the free waitlist

**Button:** Sign up

## 3. Who to show it to

- Location: Nigeria. Start with Lagos, Abuja and Port Harcourt, then widen to the whole country once you have winners
- Age: 21 to 45
- Start broad (no interests), because Meta's delivery finds the right people on its own for most new advertisers. Test one interest-based ad set alongside it: personal finance, saving money, fintech apps (Kuda, Opay, PiggyVest users), small business, entrepreneurship
- Placements: Advantage+ (automatic), with the square and 4:5 images for Feed and the video for Reels and Stories

## 4. Test before you scale

**Weeks 1 to 2 (learn):** one campaign, with ads for the three single-image hooks (A, B, C), the carousel and the Reels video. Give it a small daily budget you're comfortable losing while you learn, and don't change anything for at least 3 to 5 days.

**Look at:** cost per signup first, then click-through rate. Ignore likes.

**Week 3 onwards (scale):** turn off the weakest ads, move the budget to the best one or two, and raise it slowly (about 20% every few days) so delivery doesn't reset.

**Keep it fresh:** the same ad wears out as people see it again and again. When cost per signup starts climbing, make a new hook in the same style. The HTML files here are easy to edit and re-export.

## 5. Track where signups come from

Point website ads at your waitlist page with tags, so the signup records the source:

- `?utm_source=instagram&utm_campaign=waitlist-hook-a`
- `?utm_source=instagram&utm_campaign=waitlist-carousel`
- `?utm_source=instagram&utm_campaign=waitlist-reels`

The waitlist page already saves `utm_source` with each signup.

## 6. Before the first ad goes live

- [ ] The waitlist page is hosted on your domain and the signup backend is deployed
- [ ] A privacy policy page exists (required for Instant Forms, and good practice anyway)
- [ ] The domain is confirmed: every creative says `budgetfriendly.ng`. Change it if you use `.app`
- [ ] The Instagram account is a Business or Creator account, linked to a Meta Business account
- [ ] In Ads Manager, check whether a Special Ad Category applies to financial services in your target region. BudgetFriendly doesn't lend money, but Meta asks about financial products

## Sources

- [Meta: Design specifications for carousel ads](https://www.facebook.com/business/help/1114358518575630)
- [Meta: Aspect ratios supported by placements](https://www.facebook.com/business/help/682655495435254?id=271710926837064)
- [Meta: About lead ads with instant forms](https://www.facebook.com/business/help/761812391313386)
- [Meta safe zones for 2026 (AdNabu)](https://blog.adnabu.com/meta-ads/meta-safe-zones/)
- [Instagram carousel ad examples and tips (Hookd)](https://www.gethookd.ai/learn/8-effective-instagram-carousel-ad-examples-tips-for-2026/)
- [Meta lead ads: Instant Forms or website? (Katie Robson)](https://katierobson.uk/blog/meta-lead-ads-instant-forms-or-website/)
- [Meta Ads for lead generation, 2026 guide (AdLibrary)](https://adlibrary.com/posts/meta-ads-for-lead-generation)
- [Instagram ads for new startups (Mean CEO)](https://blog.mean.ceo/instagram-ads-new-startups/)
- [Meta Ads creative guide for small businesses (Verde Media)](https://verdemedia.com/blog/the-guide-to-meta-ads-creative-2026)
