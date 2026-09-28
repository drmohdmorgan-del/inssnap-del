# INSSNAPP Master Specification

**Version:** September 2026
**Status:** Foundation (TASK-001/002/003 complete)

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
| TASK-004 | Resident role experience | ⏳ Pending |
| TASK-005 | Prospect role experience | ⏳ Pending |
| TASK-006 | Broker role experience | ⏳ Pending |
| TASK-007 | Management live operations, Control Center workflow monitor | ✅ Complete (2026-09-28: tabbed Management desktop — live showings monitor with state filter, property/unit CRUD, eligibility toggle, residents list with participation status, reports (funnel, resident response times from audit events, participation), settings with truthful PMS status; Control Center (inssnapp_admin only, client + API) — org overview, workflow state distribution, filtered audit log, truthful integration status (hardcoded "Notifications: connected" badge removed), security events (login/MFA failures, session revocations recorded by auth routes); security_events table; cross-org 404 pattern on all new routes; 14 new API tests, all suites green) |
| TASK-008 | PMS sandbox/adapter, notifications | ⏳ Pending |
| TASK-009 | Checkr sandbox workflow, compliance-safe boundary | ⏳ Pending |
| TASK-010 | Security hardening, E2E tests, load/concurrency tests, pilot deployment, release audit | ⏳ Pending |

## 6. Security & Privacy Baseline

- Organization/tenant isolation on every data query and API operation.
- Role-based authorization for Management, Resident, Prospect, Broker, INSSNAPP Admin.
- Encryption in transit and at rest; secrets stored outside source control.
- Private resident information is not exposed to prospects or brokers unless authorized.
- Immutable/auditable records for material showing and administrative actions.
- Rate limiting, session management, input validation, backup/recovery, incident response.
