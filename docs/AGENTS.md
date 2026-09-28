# INSSNAPP — Agent Guide

## Repository Layout

```
inssnapp/
├── apps/web/                  # Next.js Management Portal + Control Center
│   ├── app/
│   │   ├── admin/             # Management dashboard
│   │   ├── control/           # Control Center
│   │   ├── login/             # Authentication
│   │   └── api/               # REST API (auth, showings, units, events)
│   ├── components/            # Shared UI components
│   └── lib/                   # Store, engine adapter, auth helpers
├── packages/
│   ├── engine/                # Authoritative Showing Engine (core domain)
│   ├── db/                    # PostgreSQL schema (TASK-002)
│   └── auth/                  # Session + RBAC
└── docs/                      # Specifications
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js dev server |
| `npm test` | Run engine + auth + db + web tests (db tests skip without `DATABASE_URL`; web route tests run the in-memory path) |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply the PostgreSQL schema (requires `DATABASE_URL`, idempotent) |
| `npm run db:seed` | Seed demo orgs/users — dev only, requires `DATABASE_URL`, refuses production |

## Showing Engine Authority

The Showing Engine (`packages/engine`) is the **sole authority** for showing-state
transitions. No UI, adapter, or integration may independently define workflow rules.

### States
`AVAILABLE → REQUESTED → RESIDENT_ACCEPTED → BROKER_GATE → CONFIRMED → IN_PROGRESS → COMPLETED → OUTCOME`

### Transitions
`PROSPECT_REQUEST`, `RESIDENT_ACCEPT`, `RESIDENT_DECLINE`, `BROKER_ASSIGN`,
`BROKER_ACCEPT`, `BROKER_DECLINE`, `CONFIRM`, `CHECK_IN`, `COMPLETE`,
`RECORD_OUTCOME`, `EXPIRE`

### Enforcement Order
1. Idempotency — repeated requests are safe
2. Existence — showing must exist
3. Tenant isolation — actor belongs to the showing's org
4. Role policy — actor's role may perform the transition
5. State legality — transition is valid from current state
6. Concurrency — optimistic locking prevents double-booking
7. Audit — immutable event emitted for every material transition

## Roles

| Role | Capabilities |
|------|-------------|
| `management` | Full portfolio oversight, confirm/assign, reporting |
| `resident` | Availability, accept/decline requests, check-in, complete |
| `prospect` | Request showing, record outcome (Apply/Watch/Decline) |
| `broker` | Accept assignment, check-in, complete, rate |
| `inssnapp_admin` | Cross-org oversight, audit, integration health, feature flags |

## Demo Accounts (password: `pw`)

| Role | Email |
|------|-------|
| Management | manager@inssnapp.demo |
| Control Center | admin@inssnapp.demo |
| Resident | resident@inssnapp.demo |
| Prospect | prospect@inssnapp.demo |
| Broker | broker@inssnapp.demo |

**Dev only:** the admin account has MFA enabled. Enroll the demo TOTP secret
from `apps/web/lib/demo.ts` in an authenticator app to complete admin login.
Demo passwords are argon2id-hashed at seed time (`apps/web/lib/store.ts`);
the legacy `s1:` demo hashes are no longer accepted.

**Production auth notes:** set `INSSNAPP_AUTH_SECRET` (session-cookie HMAC key)
— the built-in fallback is dev-only. Sessions are server-side and expire
after 7 days; admin accounts require TOTP (otplib, ±30s tolerance).
