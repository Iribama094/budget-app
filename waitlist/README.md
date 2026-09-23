# The waitlist site

Plain HTML and CSS, no build step. Live at https://budgetfriendly-waitlist.vercel.app

## Read this before you change anything here

**This folder does not deploy itself.** Pushing to `main` changes nothing on the live site. The Vercel
project's Git connection is deliberately off: while it was on, a push rebuilt the site from the repository
root and served the old web app instead of this one.

So every change here needs two steps:

```bash
node scripts/check-site-deployed.mjs   # from the repo root: is the live site behind?
cd waitlist
npx vercel link --yes --project budgetfriendly-waitlist   # first time in a fresh checkout only
npx vercel deploy --prod --yes
```

If you forget the second step, your change sits in the repo and nobody sees it. The check above is there so
that never has to be remembered: it compares every page on the live site with this folder and says which are
behind.

To make pushes deploy again, connect the project to the repository **and** set its Root Directory to
`waitlist` in the Vercel dashboard, under Settings, General. The Root Directory is the part that was missing
before. Then delete this warning.

## What is here

| File | What it is |
| --- | --- |
| `index.html` | The landing page |
| `join.html`, `joined.html` | The sign-up form and the thank-you page, which posts to `POST /v1/waitlist` |
| `privacy.html`, `terms.html` | Drafted from what the app actually does. A lawyer should read them before launch |
| `404.html` | Shown for any address that does not exist |
| `styles.css` | Every style. The type scale is deliberately small: body 15.5px, hero up to 46px, headings up to 31px, which is where Mono, Flutterwave and Moniepoint sit. Larger reads as zoomed in |
| `config.js` | The API address, and the CAPTCHA site key when one is set |
| `vercel.json` | Security headers and caching |
| `instagram/` | Launch images and captions, not served by the site |

## When the real domain is connected

Absolute links point at the Vercel address for now. Swap them to the domain in: the canonical and preview tags
in each page, `robots.txt`, `sitemap.xml`, and the `WAITLIST_SITE_URL` function secret, which is what invite
links are built from. A comment in each page says the same.
