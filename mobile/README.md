# BudgetFriendly: phone app

Expo SDK 57, React Native, TypeScript. What it does is in [docs/FUNCTIONAL.md](../docs/FUNCTIONAL.md); how it fits together is in [docs/TECHNICAL.md](../docs/TECHNICAL.md).

## Run it

```bash
npm install
npx expo start            # add --tunnel if the phone is not on the same Wi-Fi
```

Scan the QR code with Expo Go. No `.env` is needed: the app is preconfigured for the BudgetFriendly Supabase project in `src/config.ts`, signs people in through Supabase Auth and calls the `api` Edge Function under `/v1/*`.

To change that, copy `.env.example` to `.env` and set:

| Variable | When to set it |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Only to point the app at a different Supabase project |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same, the publishable key for that project |
| `EXPO_PUBLIC_MONO_PUBLIC_KEY` | Live bank connections. `test_pk_...` in sandbox, `live_pk_...` once approved. The secret key goes on the server, never here |

Anything starting `EXPO_PUBLIC_` is built into the app and visible to anyone who has it, so never put a secret there.

Only use `npx expo start --clear` after a transform error; it throws away Metro's cache.

## Before committing

```bash
npx tsc --noEmit
```

## Things to know

- **Icons**: import them from `src/icons.ts`, not `lucide-react-native`. Importing the package directly pulls all ~1,670 icons into the development bundle. Add a line to `src/icons.ts` when a screen needs a new one.
- **Sign-in session** is stored in the keystore through `src/lib/secureSessionStorage.ts`. Do not point supabase-js at AsyncStorage.
- **Passwords**: every password field uses `src/lib/passwordRules.ts`.
- **Sheets and modals**: import `Modal` from `src/components/Common/AppModal`, not `react-native`, so screen tips never open over an open sheet (that can freeze an iPhone). To close a sheet and then navigate, use `src/lib/afterSheetCloses.ts`.
- **Going back**: use `goBackOrHome` from `src/navigation/goBack.ts`, not `navigation.goBack()`, so a screen opened from a notification never dead-ends.
- **Push notifications** need an EAS project ID in `app.json` (`expo.extra.eas.projectId`), which does not exist yet. Until then, no push token is requested.
- **Installable builds** (APK, TestFlight) need EAS, which is not set up yet. See [docs/READINESS.md](../docs/READINESS.md).
- Push notifications, Face ID and home-screen widgets need a development or store build; they don't work in Expo Go. See "Features that need extra setup" in [../DEPLOY.md](../DEPLOY.md).
- Testing on an iPhone from a Mac: [TESTING_ON_MAC.md](TESTING_ON_MAC.md).
