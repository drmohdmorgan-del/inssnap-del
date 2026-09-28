# INSSNAPP — CLAUDE.md

## Project

INSSNAPP is resident-powered leasing coordination infrastructure for occupied
residential units. This repository is the foundation build implementing the
September 2026 scope.

## Quick Start

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # Engine tests
```

## Mobile (TASK-004/005/006)

One Expo codebase (`apps/mobile`) with role-based Resident / Prospect /
Broker experiences. Run `npx expo start` in `apps/mobile` with the web
backend reachable; see `apps/mobile/README.md` for the API-URL setup.
Mobile code never ships in the web bundle (`npm run build` is web-only);
`npm test` and `npm run typecheck` (tsc -b) both cover `apps/mobile`.

## Demo Login

Password for all accounts: `pw`

| Role | Email |
|------|-------|
| Management | manager@inssnapp.demo |
| Control Center | admin@inssnapp.demo |
| Resident | resident@inssnapp.demo |
| Prospect | prospect@inssnapp.demo |
| Broker | broker@inssnapp.demo |

## Architecture Decisions

- **Showing Engine** is a pure, testable state machine — the sole authority for transitions.
- **Store interface** abstracts persistence; in-memory now, PostgreSQL at TASK-002.
- **Auth** uses signed HMAC cookies (edge-compatible, no native deps).
- **Tenant isolation** enforced at the engine layer, not just the UI.
- **Idempotency** via caller-supplied keys, persisted with audit events.

## Scope Boundaries (MVP)

Not in scope: lease execution, rent payment, production background screening,
autonomous AI housing decisions, accounting/commission settlement, advanced
recommendation AI, per-role native mobile codebases.
