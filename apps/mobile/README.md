# INSSNAPP Mobile — `@inssnapp/mobile`

One Expo (React Native + TypeScript) codebase with three role-based
experiences: **Resident** (TASK-004), **Prospect** (TASK-005), and **Broker**
(TASK-006). Every action calls the real engine API routes in `apps/web` —
there are no mocked flows in the app.

## Prerequisites

- Node 20+
- The web backend running (`npm run dev` in the repo root → http://localhost:3000),
  or any reachable deployment of `apps/web`
- [Expo Go](https://expo.dev/go) on your phone, **or** an iOS simulator / Android emulator

## Run it

```bash
cd apps/mobile
npm install          # once (root install already covers workspaces)
npx expo start
```

Then scan the QR code with Expo Go, or press `i` (iOS simulator) / `a`
(Android emulator).

### Pointing the app at the backend

The app needs the API base URL at bundle time:

| Where you run the app | What to set |
|---|---|
| iOS simulator / web | nothing — defaults to `http://localhost:3000` |
| Physical device (Expo Go) | `EXPO_PUBLIC_API_URL=http://<your-machine-LAN-IP>:3000` |
| Staging / production backend | `EXPO_PUBLIC_API_URL=https://your-backend.example.com` |

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 npx expo start
```

(On a physical device `localhost` is the phone itself, so the LAN IP is
required. The app also falls back to the Metro host with port 3000 when
no env var is set.)

The session cookie is stored in the device secure store (keychain /
encrypted preferences) and restored on launch; sign-out clears it.

### Demo accounts (dev builds only)

Password for all demo accounts: `pw`. The sign-in screen shows
quick-login buttons in dev builds:

| Role | Email |
|------|-------|
| Resident | resident@inssnapp.demo |
| Prospect | prospect@inssnapp.demo |
| Broker | broker@inssnapp.demo |

Management / admin accounts can sign in but are shown a "use the web
portal" screen — the mobile app is built for the three field roles.

## What each role gets

- **Resident** — verified unit status, **Available NOW** toggle per unit,
  incoming request inbox with Accept/Decline, live showing status,
  check-in, complete, and post-completion star rating.
- **Prospect** — eligible-unit discovery (search), unit detail, Request
  Showing, live request status, and Apply / Watch / Decline after the
  tour.
- **Broker** — assignment queue, accept/decline assignment, check-in,
  complete, and post-completion star rating.

Status lists poll every ~8 seconds plus pull-to-refresh. Failures
(server errors, expired sessions, offline) are shown honestly with a
retry — the app never invents data.

## Tests & typecheck

```bash
npm test            # vitest: API client (mocked fetch) + role-flow logic
npm run typecheck   # tsc --noEmit (also covered by root `npm run typecheck` via tsc -b)
```

The API client (`src/api/client.ts`) and flow logic (`src/flows/`) are
plain TypeScript with no React Native imports, so they unit-test under
node. UI components are verified by typecheck; on-device behavior
requires Expo Go (not exercised in CI).

## Project layout

```
apps/mobile/
  app.json            Expo config (name, slug, icons, plugins)
  index.ts            Expo entry → src/App.tsx
  src/
    api/              client.ts (HTTP + cookie jar), types.ts, config.ts, session-storage.ts
    flows/            resident.ts, prospect.ts, broker.ts, common.ts (pure display logic)
    screens/          LoginScreen, MfaScreen, ResidentHome, ProspectHome, BrokerHome, shared.tsx
    ui/               components.tsx (theme + primitives)
    App.tsx           session bootstrap + role-aware routing
  tests/              api-client.test.ts, flows.test.ts
```

Workflow rules live in the Showing Engine server-side
(`packages/engine`); the `flows/` modules only decide which buttons to
render.
