# @exclusions/client

React 19 PWA for real-time classroom **exclusion tracking**, plus the Capacitor 8 shells that
wrap the same build into the Android and iOS apps. French UI, tablet-first, large touch targets —
a teacher reports an exclusion in **under 10 seconds** (class grid → student → reason → confirm).

Stack: Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), react-router 7 (library mode),
TanStack Query 5, recharts 3, Capacitor 8. Domain types, API schemas and the exclusion lifecycle
come from [`@exclusions/shared`](../../packages/shared) — the single source of truth.

## Dev quickstart

From the repo root (one `npm install` covers the whole workspace):

```bash
# Terminal 1 — the API (wrangler dev, serves http://localhost:8787)
npm run dev -w @exclusions/server

# Terminal 2 — the web client (http://localhost:5173, proxies /api → :8787)
npm run dev -w @exclusions/client
```

The Vite dev server proxies every `/api` request to `http://localhost:8787`
(see `vite.config.ts`), so no configuration is needed in dev.

### `VITE_API_URL`

The API base URL. Empty/unset (the default) means **same origin**: the dev proxy in
development, and the production Worker in production (it serves both the API and these static
assets). Set it only when the client is hosted apart from the API:

```bash
VITE_API_URL=https://exclusions.example.org npm run build -w @exclusions/client
# Or in dev:
VITE_API_URL=http://localhost:8787 npm run build -w @exclusions/client
```

## Commands

| Command                                   | Purpose                               |
| ----------------------------------------- | ------------------------------------- |
| `npm run dev -w @exclusions/client`       | Vite dev server with `/api` proxy     |
| `npm run typecheck -w @exclusions/client` | TypeScript, no emit                   |
| `npm run test -w @exclusions/client`      | Vitest in watch mode (happy-dom)      |
| `npm run test:run -w @exclusions/client`  | Vitest, single run                    |
| `npm run build -w @exclusions/client`     | Production build → `dist/`            |
| `npm run preview -w @exclusions/client`   | Serve the production build locally    |
| `npm run cap:sync -w @exclusions/client`  | Copy `dist/` into the native projects |

## Push notifications

- **Web/PWA**: `public/sw.js` (Web Push only — this app is online-first, no precache) +
  `src/push/index.ts` (`enablePush()` registers the service worker, fetches the VAPID public
  key from `/api/v1/push/vapid-public-key` and POSTs the browser subscription).
- **Android/iOS**: `@capacitor/push-notifications` obtains an FCM token, POSTed with
  `platform: "android" | "ios"`. Notification taps deep-link into the app
  (`pushNotificationActionPerformed` natively, `notificationclick` in the service worker).

Testing tips:

- Push requires a **secure context**: `localhost` works; any other host needs HTTPS.
- The server needs its VAPID keys (and FCM service account for native) configured — see
  [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).
- **iOS Safari** only supports Web Push once the PWA is **installed on the home screen**
  (Share → Add to Home Screen). Outside the installed PWA, `enablePush()` degrades gracefully
  with a French explanation. The native iOS app uses FCM/APNs and has no such restriction.
- Enable/disable the subscription from **Réglages → Notifications** in the app; re-posting the
  same endpoint/token is idempotent server-side, and dead subscriptions are pruned on send.

## Mobile builds (Capacitor)

`capacitor.config.ts` wraps the production `dist/` build (`appId: org.eu.sctg-development.exclusions`). The
native `android/` and `ios/` projects are generated with `npx cap add android|ios` and maintained
per [docs/MOBILE.md](../../docs/MOBILE.md) — see that guide for signing, FCM setup and store
delivery. After every web build, run `npm run cap:sync -w @exclusions/client`. Android uses
`org.eu.sctgdevelopment.exclusions` instead (Java package names can't contain hyphens); iOS keeps
the hyphenated id since it's already provisioned with Apple.

## Icons

The app icon is a single SVG (`public/icons/icon.svg`) referenced by both the manifest and the
HTML. **TODO**: generate PNG fallbacks (180×180 `apple-touch-icon`, 192/512 manifest icons) for
full iOS home-screen support — older iOS versions ignore SVG `apple-touch-icon`s.
