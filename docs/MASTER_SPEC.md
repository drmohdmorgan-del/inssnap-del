# INSSNAPP Master Specification

**Version:** September 2026
**Status:** All build tasks complete (TASK-001 through TASK-011 — foundation, auth, persistent engine, mobile experiences, management + Control Center, public website, PMS/notifications, Checkr sandbox, security hardening/E2E/release audit)

## 1. Vision

INSSNAPP is real-time leasing coordination infrastructure for occupied residential
units. Property management remains the system-of-record authority for property and
unit eligibility; INSSNAPP coordinates resident availability, prospect requests,
optional broker participation, showing status, and post-showing outcomes.

**The Missing Tile™** in real-time occupied-unit showing coordination.

## 2. Operating Model

1. Management synchronizes eligible property/unit information through a PMS adapter.
2. A participating resident controls a simple **Available NOW** status.
3. A prospective tenant requests access to an eligible unit without receiving private
   resident contact information.
4. The resident accepts or declines the request.
5. An optional broker gate can assign or confirm broker participation when required.
6. The Showing Engine confirms, locks, tracks, completes, and releases the showing workflow.
7. After the tour, the prospect selects **Apply**, **Watch**, or **Decline**.

## 3. Interfaces

| Interface        | Platform | Primary purpose |
|------------------|----------|-----------------|
| Property Mgmt    | Web      | Portfolio/unit oversight, resident enrollment, PMS sync, live monitor, reporting |
| Current Resident | Mobile   | Availability, requests, accept/decline, status, completion/rating |
| Prospective Tenant | Mobile | Discover units, request showing, live status, outcome |
| Broker           | Mobile   | Assignment, accept/decline, check-in, completion/rating |
| Control Center   | Web      | Organizations, workflow monitor, integration health, security, audit, admin |

## 4. Showing Engine (Authoritative)

The Showing Engine is the sole authority permitted to change showing state.

### States
`AVAILABLE → REQUESTED → RESIDENT_ACCEPTED → BROKER_GATE → CONFIRMED → IN_PROGRESS → COMPLETED → OUTCOME`

### Critical Rules
- Prospect cannot request unless unit is eligible and resident availability is active.
- Resident cannot accept a nonexistent, expired, or already-closed request.
- Confirmation creates the unit/showing lock to prevent conflicting active workflows.
- Broker cannot check in before confirmation when broker participation is required.
- Completion releases the lock and enables the prospect outcome step.
- Every material transition generates an auditable event (actor, org, timestamp, state change).
- Concurrent/repeated requests must be idempotent and protected against double-booking.

## 5. Build Sequence

| Task | Scope | Status |
|------|-------|--------|
| TASK-001 | Monorepo foundation, Management + Control Center foundations, Engine state defs, PMS boundary, screening boundary, roles, CI | ✅ Complete |
| TASK-002 | PostgreSQL schema, organizations, authentication, RBAC, tenant isolation | ✅ Complete (2026-09-28: argon2id hashing, real TOTP MFA for privileged roles, server-side sessions, per-org email uniqueness, idempotent `npm run db:migrate`; production still runs the in-memory store — live Postgres wiring is TASK-003, `DATABASE_URL` undecided) |
| TASK-003 | Persistent Showing Engine APIs, event model, locking, idempotency, audit | ✅ Complete (2026-09-28: named lifecycle routes under /api/showings — request, resident accept/decline, broker assign/accept/decline, confirm, check-in, complete, outcome — all delegating to the engine; PostgresStore is the live data path when DATABASE_URL is set, in-memory remains the dev fallback; showing_locks table — CONFIRM acquires the exclusive unit lock, COMPLETE releases it, concurrent confirms serialize on INSERT … ON CONFLICT; caller idempotency keys persisted with audit events; cross-org reads return 404; 30 tests: 14 engine, 7 Postgres persistence, 9 API route) |
| TASK-004 | Resident role experience | ✅ Complete (2026-09-28: one Expo codebase `apps/mobile` — role-aware shell, login + MFA step wired to the real /api/auth/login 202→TOTP flow, manual session-cookie jar persisted in the device secure store; Resident experience: verified enrollment via new GET /api/residents/me, Available NOW toggle via new POST /api/residents/me/availability (resident may flip only their own linked unit), incoming-request inbox, accept/decline, live status with polling, check-in, complete, post-completion star rating via new POST /api/showings/[id]/rating; 9 new web API tests + 24 mobile unit tests, all green) |
| TASK-005 | Prospect role experience | ✅ Complete (2026-09-28: same Expo codebase — eligible-unit discovery (eligible + residentAvailable) with search from GET /api/units, unit detail, Request Showing via POST /api/showings/request with caller idempotency keys, live request-status tracking, Apply/Watch/Decline via POST /api/showings/[id]/outcome; covered by the mobile unit tests + existing engine/route suites) |
| TASK-006 | Broker role experience | ✅ Complete (2026-09-28: same Expo codebase — assignment queue (showings assigned to the broker in BROKER_GATE/CONFIRMED/IN_PROGRESS/COMPLETED), accept/decline assignment, check-in, complete, post-completion star rating; all actions hit the real named engine routes; covered by the mobile unit tests + existing engine/route suites) |
| TASK-007 | Management live operations, Control Center workflow monitor | ✅ Complete (2026-09-28: tabbed Management desktop — live showings monitor with state filter, property/unit CRUD, eligibility toggle, residents list with participation status, reports (funnel, resident response times from audit events, participation), settings with truthful PMS status; Control Center (inssnapp_admin only, client + API) — org overview, workflow state distribution, filtered audit log, truthful integration status (hardcoded "Notifications: connected" badge removed), security events (login/MFA failures, session revocations recorded by auth routes); security_events table; cross-org 404 pattern on all new routes; 14 new API tests, all suites green) |
| TASK-011 | Public marketing website (public routes in apps/web) | ✅ Complete (2026-09-28: new public landing `/` (replaces the `/login` redirect) + `/services`, `/how-it-works`, `/roles`; static server-rendered marketing copy — hero positioning "Resident-Powered Leasing Infrastructure / The Missing Tile™", full end-to-end workflow, five role experiences, six service cards, one-Expo-codebase iOS/Android mobile mention, Sign in → `/login` and contact CTAs; shared marketing components under `components/marketing/` — CSS/SVG only, no external assets; `/login`, `/admin`, `/control` unchanged and still auth-gated; copy kept in building/pilot-stage language; 12 new route tests: public pages render 200-equivalent without auth and leak no org/demo data, anonymous API calls still 401, /admin + /control still redirect to /login; all suites green) |
| TASK-008 | PMS sandbox/adapter, notifications | ✅ Complete (2026-09-28: new `@inssnapp/integrations` package — vendor-neutral `PmsAdapter` interface (list/sync properties+units, resident roster, health check) with idempotent `runPmsSync` runner keyed on vendor external ids; `SandboxPmsAdapter` Yardi-like fixture dataset, registered per-org via `pms_adapters` (adapter_type `sandbox`, config JSON; new columns `adapter_type`, `config`, `last_health_check_at`, `health_status`, `properties.pms_external_id`); `NotificationAdapter` interface with dev `ConsoleNotificationAdapter` default + fail-open `notifySafely` — hooks on request, accept/decline, confirm, complete (replays don't re-notify; reminder event defined for a future scheduler); POST /api/integrations/sync (privileged; health-check fail-closed) with "Sync now" in the Management Settings panel; integrations API + Settings/Control Center show real adapter type, last sync, last health check; 24 new tests: 15 adapter/notification unit, 9 API incl. idempotency, org-scoping, throwing-provider fail-open, and full showing lifecycle on synced data; all suites green) |
| TASK-009 | Checkr sandbox workflow, compliance-safe boundary | ✅ Complete (2026-09-28: `ScreeningAdapter` vendor-neutral interface (requestScreening, getScreeningStatus) + `SandboxCheckrAdapter` mocked implementation — deterministic clear/review/consider fixtures, zero I/O, no real screening API call path exists anywhere; consent fail-closed — `ScreeningService` refuses requests without a recorded consent record (who, when, exact scope text), org-scoped; structural production gate — `resolveScreeningMode` returns production only when configured mode + `SCREENING_PRODUCTION_ENABLED` env flag + recorded legal-approval record ALL hold (defaults to sandbox; `PRODUCTION_PREREQUISITES` documented in code: credentials, consent flows, permissible purpose, adverse-action procedures, privacy controls, legal review); no autonomous decisions — `@inssnapp/engine` has no `@inssnapp/integrations` dependency and no screening reference (asserted by test), results are informational, visible only to management roles; new tables `screening_consents`, `screening_reports`, `screening_legal_approvals` (+ in-memory store + unified `db.screening`); new API routes GET /api/screening (mode banner, recent screenings, consents, prerequisites), POST/GET /api/screening/consent (prospect self-consent or staff-recorded, org-scoped), POST /api/screening/request (privileged; 409 fail-closed); Control Center gets a real "Checkr Sandbox Status" panel (prominent mode banner, recent screenings, consent records, production prerequisites); /api/integrations Screening entry now reports live mode instead of the hardcoded "not configured" badge; 27 new tests: 15 package unit (consent fail-closed, fixtures, gate, org-scoping, engine independence) + 12 API (RBAC, org-scoping, fixtures, gate, integrations status); all suites green) |
| TASK-010 | Security hardening, E2E tests, load/concurrency tests, pilot deployment, release audit | ✅ Complete (2026-09-28: rate limiting on auth (login per-account + per-IP, MFA per-IP) and all showing mutations (per-user; 429 + Retry-After; in-memory per-instance, INSSNAPP_RL_* env tunables); secure HTTP headers (HSTS prod-only, nosniff, SAMEORIGIN + frame-ancestors, referrer-policy, minimal CSP, permissions-policy); input-validation review + 2000-char cap on screening consent scopeText; demo accounts never seeded in production — bootstrap admin via INSSNAPP_BOOTSTRAP_ADMIN_{EMAIL,PASSWORD_HASH,TOTP_SECRET} or zero users (fail closed); idempotency lookups org-scoped (matches UNIQUE (organization_id, idempotency_key)); commitAndAudit — atomic state-commit + audit-insert (single Postgres transaction; single synchronous section in-memory); in-memory store mirrors the PG unique idempotency constraint (23505) so the 5-way same-key create race is automated on BOTH paths; reminder cron GET /api/cron/reminders (CRON_SECRET-guarded, daily via vercel.json, one reminder per CONFIRMED showing via reminder_sends ledger — honest limitation: stale-CONFIRMED nudge, no scheduledAt in the domain); full multi-role lifecycle E2E test (in-memory) + PG mirror incl. cross-org 404, wrong-role 403, privacy (no resident contact in prospect payloads), 409 UNIT_LOCKED double-booking + lock release; npm audit BLOCKED by the sandbox registry proxy policy — must run from an unrestricted network before the pilot; release audit notes in docs/RELEASE_AUDIT.md; 172 tests green) |

## 6. Security & Privacy Baseline

- Organization/tenant isolation on every data query and API operation.
- Role-based authorization for Management, Resident, Prospect, Broker, INSSNAPP Admin.
- Encryption in transit and at rest; secrets stored outside source control.
- Private resident information is not exposed to prospects or brokers unless authorized.
- Immutable/auditable records for material showing and administrative actions.
- Rate limiting, session management, input validation, backup/recovery, incident response.
