# BudgetFriendly (mobile)

The phone app, built with Expo and React Native.

## Setup

```bash
npm install
npm run start
```

No `.env` is needed. The app is preconfigured for the BudgetFriendly Supabase project in `src/config.ts`, and signs people in through Supabase Auth and calls the `api` Edge Function under `/v1/*`.

To change that, copy `.env.example` to `.env` and set:

| Variable | When to set it |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Only to point the app at a different Supabase project |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same, the publishable key for that project |
| `EXPO_PUBLIC_MONO_PUBLIC_KEY` | Live bank connections. `test_pk_...` in sandbox, `live_pk_...` once approved. The secret key goes on the server, never here |

Anything starting `EXPO_PUBLIC_` is built into the app and visible to anyone who has it, so never put a secret there.

## Notes

- Push notifications, Face ID and home-screen widgets need a development or store build; they don't work in Expo Go. See "Features that need extra setup" in [../DEPLOY.md](../DEPLOY.md).
- Testing on an iPhone from a Mac: [TESTING_ON_MAC.md](TESTING_ON_MAC.md).
