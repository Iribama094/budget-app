# Running BudgetFriendly in the iOS Simulator

A step-by-step guide for previewing the app on a Mac.

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

## 2. Point the app at a backend

Create a file named `.env` inside the `mobile` folder:

```
EXPO_PUBLIC_API_BASE_URL=<API address from the app owner>
```

The owner's own dev address (for example `http://172.20.10.3:3002`) only works on their home network. Use one of these instead:

- **The deployed API** the owner gives you. This is the easiest option.
- **The backend running on this Mac.** See "Running the backend locally" below, then use `http://localhost:3002`.

## 3. Quick preview (about 5 minutes)

```bash
npx expo start
```

When the menu appears, press **`i`**. This installs Expo Go in the iPhone simulator and opens the app.

Every screen can be previewed this way. **Face ID, the home-screen widget and push notifications** need the full build in step 4.

## 4. Full build with Face ID and the widget (first build takes 10–20 minutes)

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
| **Offline mode** | Turn off the Mac's Wi-Fi, add a transaction (it's saved on the phone), then turn Wi-Fi back on and watch it sync. |
| **Paste a bank alert** | Copy a bank SMS on the Mac, then in the app go to **Add transaction › clipboard icon › Paste**. |
| **Different iPhone sizes** | **File › Open Simulator** and pick another model, e.g. iPhone SE or iPhone 16 Pro Max. |
| **Dark mode** | **Account › Appearance › Dark**, or **Features › Toggle Appearance** in the simulator. |

To capture what you see, press **⌘S** for a screenshot, or use **File › Record Screen** for a video. Both are saved to the Desktop.

## Running the backend locally (optional)

From the repository root (`budget-app`, not `mobile`):

```bash
npm install
cp .env.example .env
```

Fill in the real `MONGODB_URI`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env`, then start the server. Ask the owner for these values and share them privately, never in the repo.

```bash
DOTENV_CONFIG_PATH=.env npx tsx -r dotenv/config server/index.ts
```

The API listens on port 3002, so set `EXPO_PUBLIC_API_BASE_URL=http://localhost:3002` in `mobile/.env`.

## Troubleshooting

- **"Network request failed"**: the API address is wrong or not reachable from this Mac. After changing `mobile/.env`, restart with `npx expo start -c`.
- **Build errors after pulling new code**: run `npx expo prebuild --clean`, then `npx expo run:ios`.
- **Simulator doesn't open**: open Xcode once, then go to **Xcode › Settings › Platforms** and install an iOS simulator.
