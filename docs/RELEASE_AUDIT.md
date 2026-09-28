# INSSNAPP Engine — Release Audit Notes (TASK-010)

**Date:** 2026-09-28
**Scope baseline:** `INSSNAPP_Latest_Scope_2026.pdf` §5 (Security and privacy baseline), §7 (MVP Acceptance Criteria)
**Auditor role:** final build step — security hardening pass, E2E/concurrency verification, pilot-readiness statement.

## 1. What was verified

### §7 MVP acceptance criteria — walked bullet by bullet

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | A management-authorized unit can become eligible for resident participation | ✅ | `POST /api/units` (privileged) + eligibility toggle; E2E test creates a unit as management and asserts `eligible: true` |
| 2 | Resident can turn availability on/off and receive a valid request | ✅ | `POST /api/residents/me/availability` (own-unit only); E2E toggles off → prospect request 400s, toggles on → 201 |
| 3 | Prospect can request an available unit and receive real-time status changes | ✅ | `POST /api/showings/request`; status visible via `GET /api/showings` polling (mobile app polls); E2E polls and observes REQUESTED → … → OUTCOME |
| 4 | Resident can accept or decline without exposing private contact information | ✅ | Showing payloads carry opaque `residentUserId` only — no email/phone; E2E asserts prospect-facing JSON contains no `@inssnapp.demo` address |
| 5 | Optional broker participation can be inserted without breaking the core workflow | ✅ | `BROKER_ASSIGN`/`BROKER_ACCEPT`/`BROKER_DECLINE`; E2E runs the full broker-gate path; non-broker path covered in TASK-003 tests |
| 6 | Confirmed showing can be checked in, completed, and released correctly | ✅ | `CHECK_IN` → `COMPLETE`; COMPLETE releases the unit lock; E2E proves release by confirming a second workflow after completion |
| 7 | Prospect can record Apply, Watch, or Decline after completion | ✅ | `RECORD_OUTCOME`; E2E records APPLY; TASK-003 tests cover WATCH |
| 8 | Management and INSSNAPP Control Center can observe the workflow and audit trail | ✅ | `GET /api/events` (privileged), `/api/control/*` workflow + audit + security-events views; E2E asserts a 7-event trail with actor/org/state change/timestamp |
| 9 | Unauthorized roles and cross-organization users cannot access/mutate protected records | ✅ | Engine enforces role policy + tenant isolation on every transition; cross-org reads return 404 (not 403 — no probing); E2E asserts prospect→confirm 403, org_2 manager→org_1 showing 404, org_2 list excludes org_1 records |
| 10 | Automated tests cover valid transitions, invalid transitions, repeated actions, concurrency, and critical authorization | ✅ | 173 tests (see §3): engine legality matrix, idempotent replays, 5-way concurrent same-key race (NEW, automated — was curl-only), concurrent CONFIRM double-booking, role/tenant rejection |

### Security baseline (§5) — item by item

- **Tenant isolation:** every engine transition checks `actor.organizationId === showing.organizationId`; all API reads are org-scoped with 404-on-mismatch. **Hardened in TASK-010:** idempotency lookups are now org-scoped (`getIdempotent(key, org)`), matching the `UNIQUE (organization_id, idempotency_key)` constraint — a key from org A can no longer replay or reveal events in org B.
- **RBAC:** 5 roles enforced in the engine (sole authority) plus route-level gates (defense in depth). Privileged MFA (TOTP) for `management`/`inssnapp_admin` logins.
- **Encryption / secrets:** no secrets in the tree (scanned 2026-09-28 — only dev-only demo credentials and test fixtures). Session HMAC key via `INSSNAPP_AUTH_SECRET` env; dev fallback clearly labeled. **Hardened in TASK-010:** demo accounts (`pw` + public demo TOTP secret) are **never seeded in production** anymore. Production seeds zero users unless `INSSNAPP_BOOTSTRAP_ADMIN_{EMAIL,PASSWORD_HASH,TOTP_SECRET}` are all set (fail closed); `db:seed` already refused production.
- **Private resident info:** prospect/broker API surfaces expose opaque user ids only; emails are resolved server-side for notifications only.
- **Immutable audit records:** every material transition emits an immutable event (actor, org, timestamp, state change). **Hardened in TASK-010:** `commitAndAudit` makes the state write + audit insert atomic — one Postgres transaction (rollback on duplicate key, state unchanged), one synchronous section in-memory. No more crash window between commit and audit.
- **Rate limiting:** NEW in TASK-010 — in-memory per-instance fixed-window limits on `/api/auth/login` (per-account + per-IP), `/api/auth/mfa/verify` (per-IP), all showing mutations (per-user), and screening requests (per-user). 429 + `Retry-After`. Tunable via `INSSNAPP_RL_*` env vars.
- **Session management:** server-side sessions (token hash only stored), 7-day expiry, revocation on logout/expiry, `HttpOnly; SameSite=Lax; Secure (production)` cookie flags (verified by test).
- **Input validation:** hand-rolled boundary validation on all routes (consistent with existing style); **TASK-010** capped screening consent `scopeText` at 2000 chars. Malformed bodies fail closed with 400 (tested).
- **Secure headers:** NEW in TASK-010 — `next.config.mjs` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, minimal CSP (`frame-ancestors 'self'; form-action 'self'`), restrictive `Permissions-Policy`, and HSTS (`max-age=31536000; includeSubDomains`) in production only.
- **Secure file handling:** N/A — the MVP accepts no file uploads.
- **Backup/recovery:** not yet implemented (see §4 open items).
- **Incident response:** security events (login/MFA failures, revocations) are recorded and visible in the Control Center security view.
- **Independent review before real screening data / beyond-pilot launch:** structural gate in place (TASK-009) — production screening requires configured mode + `SCREENING_PRODUCTION_ENABLED` + recorded legal approval; defaults to sandbox.

### Reminder scheduler (TASK-008 caveat, closed in TASK-010)

`showing.reminder` was defined on the notification interface with no scheduler. Implemented minimally:
- `GET /api/cron/reminders` — Vercel Cron (daily 09:00, `vercel.json`), guarded by `CRON_SECRET` bearer token (fail-closed 500 in production when unset).
- Finds CONFIRMED showings whose last state change is older than `REMINDER_AFTER_HOURS` (default 24), sends `showing.reminder` to prospect + resident via the fail-open adapter, and records the send in `reminder_sends` (one reminder per showing, ever).
- **Honest limitation:** showings carry no scheduled date/time in the domain model, so this is a *stale-CONFIRMED nudge*, not a true pre-appointment reminder. A future `scheduledAt` field would make it one.

## 2. Test counts

| Suite | Tests | Notes |
|-------|-------|-------|
| `@inssnapp/engine` | 14 | State legality, role policy, idempotency, tenant isolation, concurrency |
| `@inssnapp/auth` | 25 | Password hashing, TOTP, sessions, RBAC guards |
| `@inssnapp/db` (Postgres) | 10 | Full lifecycle, concurrency, **NEW:** 5-way same-key race, org-scoped idempotency, commitAndAudit atomicity. Run with `DATABASE_URL`; skipped in CI |
| `@inssnapp/integrations` | 30 | PMS sandbox, notifications, screening sandbox |
| `apps/web` (in-memory) | 70 | Route E2E, RBAC, org isolation, mobile backend, public routes, **NEW:** 9 TASK-010 (rate limit ×2, validation, race, lifecycle E2E, cron, session cookie) |
| `apps/mobile` | 24 | Role experience unit tests |
| **Total** | **173** | **All green** (`npm test`, `npm run typecheck`, `npm run build`) |

## 3. Security posture

- `npm audit`: **could not run** — the registry audit endpoint (`POST /-/npm/v1/security/audits/quick`) is blocked by this environment's package-registry proxy policy (`policy_denied`). Mitigation: direct dependencies are minimal and current (Next.js 15.5.26, React 19.1, argon2 0.45.1, otplib 13.5.0, Expo 57). **Recommendation:** run `npm audit` from an unrestricted network before the pilot and add it to the CI workflow.
- No secrets, tokens, or credentials in the tree (grep scan 2026-09-28). No `.env` files committed.
- Biggest residual risk is **the data plane, not the code**: production currently runs the **in-memory store** (no `DATABASE_URL` set) — all data is lost on redeploy/restart, and per-instance rate-limit counters don't share state. The Postgres path is fully implemented and tested; it just needs the hosted-Postgres decision + `DATABASE_URL`.

## 4. Known limitations / open items (pilot readiness)

**Ready for a controlled pilot:** the full showing workflow, RBAC, tenant isolation, audit trail, idempotency, concurrency protection, rate limiting, secure headers/sessions, and the reminder cron are implemented and tested on both the in-memory and Postgres paths.

**Still needed (owner in brackets):**
1. **Hosted Postgres decision + `DATABASE_URL`** [DrMorgan] — the single biggest item. Without it, pilot data evaporates on every deploy.
2. **Production secrets** [DrMorgan/ops] — `INSSNAPP_AUTH_SECRET`, `CRON_SECRET`, `INSSNAPP_BOOTSTRAP_ADMIN_*` (or Postgres-backed user management), Vercel env config.
3. **Run `npm audit` from an unrestricted network** [builder] — blocked in this environment (see §3).
4. **Legal/compliance review before real screening data or beyond-pilot launch** [legal] — structural gate already enforces this (TASK-009).
5. **Backup/recovery runbook** for the hosted database [ops].
6. **Reminder semantics** — consider adding `scheduledAt` to showings for true pre-showing reminders (currently a stale-CONFIRMED nudge).
7. **`GET /api/showings` visibility** — any authenticated org member can list all org showings (opaque ids only, no contact info). Acceptable for the pilot; flag for the privacy review.
8. **Mobile apps** (TASK-004/005/006) are built and unit-tested but the native packaging + device testing for the pilot is a separate track.

**Pilot-readiness verdict:** ✅ **Ready for a controlled pilot** (small property set, internal users) **once items 1–2 are done**. The engine, API, auth, and audit foundations are hardened and tested; items 3–8 are tracked follow-ups, not blockers for a controlled pilot. **Not ready** for open public launch or real tenant-screening data (legal gate, item 4).
