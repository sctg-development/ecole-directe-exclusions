# Mobile builds (Capacitor)

The Android and iOS apps are [Capacitor 8](https://capacitorjs.com/) shells around the exact same
React build as the web app (`apps/client/dist`), plus the native
`@capacitor/push-notifications` plugin for FCM push. One codebase, three delivery channels.

## Which platform matters for which school

From `packages/shared/src/schools.ts` (`teacherPlatform` — the platform of the teachers'
tablets, i.e. the app-store build that matters most for that school):

| School                            | Environment         | Teacher tablets |
| --------------------------------- | ------------------- | --------------- |
| Fondation des Apprentis d'Auteuil | `apprentis-auteuil` | **Android**     |
| Lycée Saint Dominique             | `saint-dominique`   | **iOS**         |
| Lycée Saint Paul                  | `saint-paul`        | **iOS**         |

The vie scolaire can always use the web app/PWA (with Web Push) regardless of the table above.

## Prerequisites

- Everything from the [main quick start](../README.md) (Node >= 22, `npm install`).
- **Android**: Android Studio (bundled JDK is fine), an Android SDK with API 35+.
- **iOS**: a Mac with Xcode 16+, CocoaPods, and an Apple Developer Program membership
  (needed for push entitlements and TestFlight).
- A **Firebase project** for FCM (both platforms use FCM; Firebase relays to APNs for iOS) —
  the same project whose service-account JSON becomes the server's `FCM_SERVICE_ACCOUNT` secret
  (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Adding the native projects (first time only)

```bash
cd apps/client
npx cap add android
npx cap add ios
```

This generates `apps/client/android/` and `apps/client/ios/` — **commit the generated projects**
(that is the Capacitor way: they hold signing config, icons, plugin wiring and native settings).

## Build & sync cycle

Every time the web code or a Capacitor plugin changes:

```bash
npm run build -w @exclusions/client   # from the repo root
cd apps/client
npx cap sync                          # copies dist/ + updates native plugins
```

(`npm run cap:sync -w @exclusions/client` is a shortcut for the sync step.) Then open the native
IDE to run or archive:

```bash
npx cap open android
npx cap open ios
```

Point each school's native build at that school's own Worker URL (per-school API base URL — the
apps must never talk to another school's backend).

## Firebase / push setup

### Android (FCM)

1. Firebase console → your project → _Add app_ → Android; use the `applicationId` from
   `apps/client/android/app/build.gradle`.
2. Download **`google-services.json`** into `apps/client/android/app/`.
3. `npx cap sync android`, build, run on a device (push does not work on all emulators).

### iOS (FCM → APNs)

1. Firebase console → _Add app_ → iOS; use the bundle id of the Xcode target.
2. Download **`GoogleService-Info.plist`** and add it to the app target in Xcode (Copy items if
   needed).
3. Apple Developer portal → _Keys_ → create an **APNs Auth Key** (`.p8`) and upload it in
   Firebase → _Project settings → Cloud Messaging → Apple app configuration_ (with Key ID and
   Team ID).
4. In Xcode, enable the **Push Notifications** capability and **Background Modes → Remote
   notifications** on the app target.

### App-side wiring (`@capacitor/push-notifications`)

The plugin is already a dependency of `@exclusions/client`. The client's push module follows the
standard flow:

1. `PushNotifications.requestPermissions()` after login (staff accounts only).
2. `PushNotifications.register()` → the `registration` event yields the FCM token.
3. `POST /api/v1/push/subscriptions` with `{ platform: "android" | "ios", token, deviceName }`
   (idempotent — re-posting the same token updates the row).
4. The server sends via FCM HTTP v1, authenticated with the `FCM_SERVICE_ACCOUNT` secret; expired
   tokens are pruned automatically on send. Notification texts are in French and deliberately
   minimal (see [GDPR.md](./GDPR.md)).

On the web/PWA, the same module uses Web Push (VAPID) instead — no Firebase involved.

## Store distribution

School-managed tablets are the target, so lightweight tracks are enough:

- **Android — Play Console, internal testing track**: bump `versionCode`, build a signed AAB
  (Android Studio → _Build → Generate Signed App Bundle_, with an upload key you keep safe),
  upload to _Internal testing_, add the school's Google accounts as testers. Promote to a private
  (organization-restricted) production track later if the school uses managed Google Play.
- **iOS — TestFlight**: bump the build number, Xcode → _Product → Archive_ → distribute to App
  Store Connect, then add the school's Apple IDs as TestFlight testers (internal testers need no
  review; external groups go through a light review). For long-term fleet deployment, consider
  Apple Business Manager / MDM distribution.

Remember: one school = one backend. If you distribute a single store build to several schools, it
must let the user pick/enter the school server at first launch; otherwise ship per-school builds
with the URL baked in.
