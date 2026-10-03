-- INSSNAPP PostgreSQL schema (TASK-002)
-- Organization/tenant isolation on every table.
--
-- Idempotent: safe to run repeatedly via `npm run db:migrate`. Enums are
-- created inside DO guards, tables use IF NOT EXISTS, and the TASK-002
-- auth alterations (mfa_secret, per-org email uniqueness, server-side
-- sessions keyed by token hash) are applied with ADD COLUMN / DROP
-- CONSTRAINT IF EXISTS guards so databases created from the earlier
-- draft schema migrate cleanly.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS citext;

-- ---- Enums ---------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('management', 'resident', 'prospect', 'broker', 'inssnapp_admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'showing_state') THEN
    CREATE TYPE showing_state AS ENUM (
      'AVAILABLE', 'REQUESTED', 'RESIDENT_ACCEPTED', 'BROKER_GATE',
      'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'OUTCOME'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'showing_outcome') THEN
    CREATE TYPE showing_outcome AS ENUM ('APPLY', 'WATCH', 'DECLINE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transition_name') THEN
    CREATE TYPE transition_name AS ENUM (
      'PROSPECT_REQUEST', 'RESIDENT_ACCEPT', 'RESIDENT_DECLINE', 'BROKER_ASSIGN',
      'BROKER_ACCEPT', 'BROKER_DECLINE', 'CONFIRM', 'CHECK_IN', 'COMPLETE',
      'RECORD_OUTCOME', 'EXPIRE'
    );
  END IF;
END $$;

-- ---- Tenancy -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Users & auth ----------------------------------------------------------
-- TASK-002: email is unique PER ORGANIZATION (not globally); TOTP secret
-- for MFA lives on the user record, NULL until enrolled.
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           CITEXT NOT NULL,
  full_name       TEXT NOT NULL,
  password_hash   TEXT NOT NULL,          -- $argon2id$… (or $scrypt$… fallback)
  role            user_role NOT NULL,
  mfa_secret      TEXT,                   -- base32 TOTP secret, NULL until enrolled
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id);

-- TASK-002 alterations for databases created from the earlier draft schema.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
-- Replace the draft's global UNIQUE(email) with per-org uniqueness.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_org_email_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_org_email_unique UNIQUE (organization_id, email);
  END IF;
END $$;
-- Phase 2/3: email verification for the signup flow.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- TASK-002: server-side sessions. The cookie carries an HMAC-signed opaque
-- token; only its SHA-256 hash (token_hash, the primary key) is stored.
-- Handles databases created from the earlier draft (id UUID PK + token_hash).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'id'
  ) THEN
    ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
    ALTER TABLE sessions DROP COLUMN IF EXISTS id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash      TEXT PRIMARY KEY,       -- SHA-256 hex of the opaque session token
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- Ensure token_hash is the primary key even when migrating the draft shape.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_pkey') THEN
    ALTER TABLE sessions ADD PRIMARY KEY (token_hash);
  END IF;
END $$;

-- Short-lived single-use MFA challenges. No FK to users: challenges must be
-- consumable (DELETE ... RETURNING) without join overhead, and expiry is
-- enforced at consume time. Rows are deleted on consume; this index keeps
-- the opportunistic expiry sweep cheap.
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id              TEXT PRIMARY KEY,       -- "mfa_<base64url(18 random bytes)>"
  user_id         UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_challenges_expires_idx ON mfa_challenges (expires_at);

-- ---- Portfolio --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS properties_org_idx ON properties (organization_id);
-- Phase 8 live map: building coordinates (pin-drop or Nominatim geocode).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,               -- e.g. "4B"
  pms_external_id TEXT,
  eligible        BOOLEAN NOT NULL DEFAULT false,  -- management-authorized for participation
  resident_available BOOLEAN NOT NULL DEFAULT false, -- resident "Available NOW"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS units_org_idx ON units (organization_id);
CREATE INDEX IF NOT EXISTS units_property_idx ON units (property_id);

-- ---- Residents --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS residents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  verified        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, unit_id)
);

-- ---- Signup invitations (Phase 1) -------------------------------------------
-- Management-issued invite codes; resident invites bind to one unit.
CREATE TABLE IF NOT EXISTS invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,
  unit_id           UUID REFERENCES units(id) ON DELETE SET NULL,
  role              TEXT NOT NULL CHECK (role IN ('resident', 'prospect', 'broker')),
  email             CITEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  used_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS invites_org_idx ON invites (organization_id);
CREATE INDEX IF NOT EXISTS invites_code_idx ON invites (code);

-- ---- Email verification codes (Phase 2/3 signup flow; free, no SMS) ---------
CREATE TABLE IF NOT EXISTS verification_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             CITEXT NOT NULL,
  code              TEXT NOT NULL,
  purpose           TEXT NOT NULL DEFAULT 'signup',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  attempts          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS verification_codes_email_idx ON verification_codes (organization_id, email);

-- ---- Lead dispositions (Phase 6) --------------------------------------------
-- A "lead" is a showing in OUTCOME state. Disposition is web-side metadata,
-- NOT engine state. Control directs each lead: pending | inhouse | management.
CREATE TABLE IF NOT EXISTS lead_dispositions (
  showing_id        UUID PRIMARY KEY REFERENCES showings(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  disposition       TEXT NOT NULL DEFAULT 'pending'
                    CHECK (disposition IN ('pending', 'inhouse', 'management')),
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_dispositions_org_idx ON lead_dispositions (organization_id);

-- ---- Broker tier profiles (Phase 7) ------------------------------------------
-- Tier selection is free self-serve in the pilot; no payment provider wired.
CREATE TABLE IF NOT EXISTS broker_profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier            TEXT NOT NULL DEFAULT 'trial'
                  CHECK (tier IN ('trial', 'basic', 'pro')),
  tier_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Showing Engine (authoritative) -----------------------------------------
CREATE TABLE IF NOT EXISTS showings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id           UUID NOT NULL REFERENCES units(id),
  resident_user_id  UUID NOT NULL REFERENCES users(id),
  prospect_user_id  UUID REFERENCES users(id),
  broker_user_id    UUID REFERENCES users(id),
  broker_required   BOOLEAN NOT NULL DEFAULT false,
  state             showing_state NOT NULL DEFAULT 'AVAILABLE',
  outcome           showing_outcome,
  version           INTEGER NOT NULL DEFAULT 0,   -- optimistic concurrency
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS showings_org_idx ON showings (organization_id);
CREATE INDEX IF NOT EXISTS showings_state_idx ON showings (state);
CREATE INDEX IF NOT EXISTS showings_unit_idx ON showings (unit_id);

-- ---- Audit / events (immutable) ----------------------------------------------
CREATE TABLE IF NOT EXISTS showing_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  showing_id        UUID NOT NULL REFERENCES showings(id) ON DELETE CASCADE,
  actor_user_id     UUID REFERENCES users(id),
  actor_role        user_role NOT NULL,
  transition        transition_name NOT NULL,
  from_state        showing_state NOT NULL,
  to_state          showing_state NOT NULL,
  idempotency_key   TEXT NOT NULL,
  at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS showing_events_org_idx ON showing_events (organization_id);
CREATE INDEX IF NOT EXISTS showing_events_showing_idx ON showing_events (showing_id);

-- ---- Showing locks (TASK-003) ------------------------------------------------------
-- A unit/showing lock is created when a showing is CONFIRMED and released
-- when it is COMPLETED. The primary key on unit_id guarantees at most one
-- active workflow per unit: concurrent CONFIRM attempts serialize on the
-- INSERT ... ON CONFLICT path and the loser fails closed (UNIT_LOCKED).
CREATE TABLE IF NOT EXISTS showing_locks (
  unit_id         UUID PRIMARY KEY REFERENCES units(id),
  showing_id      UUID NOT NULL REFERENCES showings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS showing_locks_showing_idx ON showing_locks (showing_id);

-- ---- Reminder sends (TASK-010) ------------------------------------------------------
-- Ledger for the /api/cron/reminders job: one reminder per showing, ever.
-- The cron finds CONFIRMED showings whose last state change is older than
-- the reminder threshold and that have no row here, sends the
-- showing.reminder notification, then inserts the row. ON DELETE CASCADE
-- keeps the ledger consistent with the showings table.
CREATE TABLE IF NOT EXISTS reminder_sends (
  showing_id UUID PRIMARY KEY REFERENCES showings(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- PMS integration boundary ------------------------------------------------
CREATE TABLE IF NOT EXISTS pms_adapters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,   -- 'yardi' | 'entrata' | 'realpage' | 'mri' | 'appfolio' | 'buildium'
  status          TEXT NOT NULL DEFAULT 'sandbox',  -- 'sandbox' | 'connected' | 'error'
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pms_adapters_org_idx ON pms_adapters (organization_id);

-- ---- Security events (TASK-007) ------------------------------------------------
-- Administrative audit of authentication-relevant activity: failed/successful
-- logins, MFA failures, session revocations. Written by the auth routes;
-- read by the Control Center security view (inssnapp_admin only).
CREATE TABLE IF NOT EXISTS security_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL when the event cannot be attributed to an organization (e.g. a
  -- login attempt for an unknown email address).
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,  -- 'login_failed' | 'login_succeeded' | 'login_denied' | 'mfa_failed' | 'session_revoked'
  actor_user_id   UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_email     TEXT NULL,
  detail          TEXT NULL,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- TASK-007 alteration: the first draft made organization_id NOT NULL, which
-- prevents recording login failures for unknown emails. Relax it.
ALTER TABLE security_events ALTER COLUMN organization_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS security_events_org_idx ON security_events (organization_id);
CREATE INDEX IF NOT EXISTS security_events_at_idx ON security_events (at DESC);

-- ---- Contact form submissions ------------------------------------------------
-- Public contact-us landing page submissions. Not org-scoped: the visitor may
-- not belong to any organization yet. Reviewed by the INSSNAPP team.
CREATE TABLE IF NOT EXISTS contact_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT,
  role        TEXT,   -- 'property_manager' | 'resident' | 'prospect' | 'broker' | 'other'
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_submissions_at_idx ON contact_submissions (created_at DESC);

-- ---- Showing ratings (TASK-004/006) -------------------------------------------
-- Post-completion participant feedback for a showing. Ratings never change
-- showing state — the engine remains the sole authority on transitions.
-- One rating per rater per showing.
CREATE TABLE IF NOT EXISTS showing_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  showing_id      UUID NOT NULL REFERENCES showings(id) ON DELETE CASCADE,
  rater_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rater_role      TEXT NOT NULL,   -- 'resident' | 'broker'
  stars           INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (showing_id, rater_user_id)
);
CREATE INDEX IF NOT EXISTS showing_ratings_showing_idx ON showing_ratings (showing_id);

-- ---- TASK-008: real PMS adapter + notification boundaries -------------------
-- The PMS adapter boundary table gains the fields a working adapter needs:
-- adapter_type (which implementation: 'sandbox' today; real vendors register
-- as commercial/API access permits), config JSON (vendor/dataset knobs —
-- never raw secrets), and last-health-check bookkeeping. Properties gain a
-- vendor external id so syncs can upsert idempotently instead of duplicating.
ALTER TABLE pms_adapters ADD COLUMN IF NOT EXISTS adapter_type TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE pms_adapters ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE pms_adapters ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;
ALTER TABLE pms_adapters ADD COLUMN IF NOT EXISTS health_status TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pms_external_id TEXT;

-- ---- TASK-009: Checkr sandbox workflow, compliance-safe boundary -------------
-- Consent records (org-scoped): a screening request is created only when a
-- consent record exists for the org+prospect; requesting without one fails
-- closed. Legal approvals: the second half of the structural production
-- gate — production consumer-report processing is impossible without a
-- recorded approval (scope §4).
CREATE TABLE IF NOT EXISTS screening_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_text      TEXT NOT NULL,
  consented_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS screening_consents_org_prospect_idx
  ON screening_consents (organization_id, prospect_user_id, consented_at DESC);

CREATE TABLE IF NOT EXISTS screening_reports (
  id              TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL,   -- 'sandbox' | 'production'
  status          TEXT NOT NULL,   -- 'clear' | 'review' | 'consider'
  detail          TEXT NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by    UUID NULL REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS screening_reports_org_idx
  ON screening_reports (organization_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS screening_legal_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by     TEXT NOT NULL,
  notes           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS screening_legal_approvals_org_idx
  ON screening_legal_approvals (organization_id, approved_at DESC);

-- ---- Platform super-admin bootstrap ---------------------------------------
-- Idempotent: creates the INSSNAPP Platform org and the owner's super-admin
-- account if they don't exist. Runs on every boot via migrate(); the
-- ON CONFLICT guards make re-application a no-op. (Added 2026-09-29 per
-- DrMorgan: super-admin access for info@iecincglobal.com.)
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'INSSNAPP Platform')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (organization_id, email, full_name, password_hash, role, mfa_enabled)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'info@iecincglobal.com',
  'Mohammed Morgan',
  '$argon2id$v=19$m=19456,p=1,t=2$y51YPKORdSQo4KjZfRDtXQ$f1odvU0QlL3Fe+wiZC+BwfFzNbm7djEVlaKSlvJH5jY',
  'inssnapp_admin',
  false
)
ON CONFLICT (organization_id, email) DO NOTHING;
