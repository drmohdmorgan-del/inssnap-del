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
