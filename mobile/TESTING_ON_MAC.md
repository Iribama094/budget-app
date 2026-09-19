# Running BudgetFriendly in the iOS Simulator

A step-by-step guide for previewing the app on a Mac.

The app already talks to its cloud backend, so there's no server to run and no `.env` file to create.

## What you need

- A Mac with **Xcode** installed from the App Store. Open it once so it finishes installing its components.
- **Node.js 20 or newer** (https://nodejs.org).
- **git**.

## 1. Get the code

```bash
git clone https://github.com/Iribama094/budget-app.git
cd budget-app
git checkout redesign-and-enhancements
cd mobile
npm install
```

## 2. Quick preview (about 5 minutes)

```bash
npx expo start
```

When the menu appears, press **`i`**. This installs Expo Go in the iPhone simulator and opens the app.

Tap **Create account** and sign up with any email address and a password of at least 8 characters. You're signed in straight away and everything you add is saved in the cloud, so it's still there next time.

A new account starts with a short **plan setup**: what's hardest about money, income and payday, regular bills, then a Needs / Wants / Savings plan and a daily reminder. You can skip it; Home then shows a **Your first week** checklist.

Every screen can be previewed this way. **Face ID, the home-screen widget and push notifications** need the full build in step 3.

## 3. Full build with Face ID and the widget (first build takes 10–20 minutes)

```bash
npx expo run:ios
```

This generates the native iOS project, installs dependencies, builds the app in Xcode and launches it in the simulator.

If Xcode reports a **signing / development team** error (the widget shares data with the app through an App Group):

1. Open `ios/BudgetFriendly.xcworkspace` in Xcode.
2. For both the **BudgetFriendly** and **SafeToSpendWidget** targets, go to **Signing & Capabilities** and choose your Apple ID under **Team**. A free personal team is fine for the simulator.
3. Run `npx expo run:ios` again.

## Trying the features in the simulator

| To try | Do this |
| --- | --- |
| **Face ID sign-in** | Menu bar: **Features › Face ID › Enrolled**. Sign in once with a password and accept "Sign in with Face ID?". Close and reopen the app, then use **Features › Face ID › Matching Face** when prompted. |
| **Home-screen widget** | Press **⌘⇧H** to go home. Long-press the home screen, tap **+**, search for **BudgetFriendly**, then add **Safe to spend**. |
| **Your plan** | Tap your initials on Home › **Profile** › **Income & bills**. Change income or switch between payday-to-payday and calendar-month budgets. |
| **Categories** | Home › gear icon (top right) › **Categories** › add one, like "Generator fuel". Add an expense with the note "Shoprite", then start another with the same note and watch the category get suggested. |
| **Flux, the AI coach** | Home › sparkle icon. It answers once the app owner adds the AI key; until then it says it isn't switched on. |
| **Offline mode** | Turn off the Mac's Wi-Fi, add a transaction (it's saved on the phone), then turn Wi-Fi back on and watch it sync. |
| **Paste a bank alert** | Copy a bank SMS on the Mac, then in the app go to **Add transaction › clipboard icon › Paste**. |
| **Shared budget** | Create a second account in another simulator (**File › Open Simulator**). On the first, open a budget and tap **Share** to get a code; on the second, join with that code. |
| **Signed-in devices** | Sign in to the same account in two simulators, then tap your initials on Home › **Profile** › **Your devices** and sign the other one out. |
| **Different iPhone sizes** | **File › Open Simulator** and pick another model, e.g. iPhone SE or iPhone 16 Pro Max. |
| **Dark mode** | Home › gear icon › **Appearance** › **Dark**, or **Features › Toggle Appearance** in the simulator. |
| **Business tools** | Switch to **Business** on Home, then try invoices, bills, payroll, tax estimates, reports and a Paystack/Moniepoint CSV upload. The upload creates transactions for review; it does not connect a live provider. |
| **Goal savings** | Add income with auto-save turned on for a goal, then answer "I moved it" or "Not this time" on Home or Goals. Adding money on a goal also records a Savings expense unless you switch that off. |
| **Money Wrapped** | Profile › **Money Wrapped**, any time. Home also shows a Wrapped card in July/August (first half of the year), December (the year so far) and January (last year). |

To capture what you see, press **⌘S** for a screenshot, or use **File › Record Screen** for a video. Both are saved to the Desktop.

**Forgot password** sends a 6-digit code by email. Until the app owner turns on email delivery, the code won't arrive, so use accounts whose password you know.

## Troubleshooting

- **"Check your connection and try again"**: the Mac is offline, or a network filter is blocking `supabase.co`.
- **Build errors after pulling new code**: run `npx expo prebuild --clean`, then `npx expo run:ios`.
- **Simulator doesn't open**: open Xcode once, then go to **Xcode › Settings › Platforms** and install an iOS simulator.
- **Stale screens after pulling new code**: restart with `npx expo start -c`.
