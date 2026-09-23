# Working in this repo

## Writing

**No em dashes. Anywhere.** Not in UI copy, not in docs, not in code comments, not in commit messages. Use a
comma, a colon or a full stop. En dashes are fine where they already are, in date ranges.

This has been asked for repeatedly, so there is a check:

```
node scripts/check-writing.mjs
```

Run it before you commit anything with words in it.

Where a value is missing, write what is missing ("Not set", "No date", "Not yet") rather than a dash.

## Tone

Plain words, the ones the person would use. "Bills", not "Recurring obligations". Say what happens next, not
what the system did. Keep it short enough to read on a phone in one go.

## Before you push

- `cd mobile && npx tsc --noEmit -p .`
- `cd mobile && npx expo export --platform android` if you changed the app
- `cd supabase/functions/api && DENO_NO_PACKAGE_JSON=1 npx -y deno@2 check --node-modules-dir=none index.ts` if
  you changed the API
- `node supabase/scripts/e2e.mjs "$(pwd)"` after deploying the API
- `node scripts/check-writing.mjs`
- `node scripts/check-site-deployed.mjs` if you changed anything in `waitlist/`. That site is deployed by hand,
  so the repo and the live pages drift apart silently. See `waitlist/README.md`.

The e2e suite is run from this machine, whose connection drops often enough to matter. Failures that move
between runs are the line, not the code: re-run before digging, and only believe a check that fails twice. When
re-running is slow, write a short probe that hits the one endpoint a few times with a throwaway account.

## Layers on screen

Only a real sheet or picker is a React Native `Modal`, and it comes from `components/Common/AppModal`, never
from `react-native` directly. Anything else drawn over a screen, a tip, a coach mark, a nudge, is an overlay:
an absolutely positioned `View` with a high `zIndex`, returning `null` when hidden. Two native layers opening
or closing over each other freezes the app until it is reloaded, and that bug is hard to find later.

When something closes a sheet and then navigates or opens another sheet, put the second action inside
`lib/afterSheetCloses`.

## Several agents work here at once

Say what you are about to touch before you touch it, push small commits, and tell the others the hash. Never
push or deploy work that is not yours. Do not commit `api/_lib/`, `api/tax_rules/`, `api/v1/` or `deno.lock`.
