/**
 * DEV-ONLY demo seed (TASK-002).
 *
 * Usage:
 *   npm run db:seed                 (from the repo root; requires DATABASE_URL)
 *
 * Inserts the two demo organizations and the six demo accounts
 * (password "pw", argon2id-hashed at seed time). The admin account gets
 * MFA enabled with the public demo TOTP secret — identical to the
 * in-memory seed, so local dev behaves the same on either store.
 *
 * NEVER run against a production database. Demo data only.
 */

import { hashPassword } from "@inssnapp/auth";
import { PostgresStore } from "./client.ts";
import { usingPostgres } from "./client.ts";
import { pathToFileURL } from "node:url";

/**
 * Fixed demo TOTP secret for the admin account.
 * DEV-ONLY — must match DEMO_TOTP_SECRET in apps/web/lib/demo.ts so the
 * in-memory and Postgres paths behave identically in local dev.
 */
export const DEMO_TOTP_SECRET = "FWAMPWRLJSMTZFD7VBDECWXPZRDEIUZC";

const DEMO_ORGS = [
  { name: "Skyline Residential Group" },
  { name: "Harbor Point Management" },
];

const DEMO_USERS = [
  { email: "manager@inssnapp.demo", fullName: "Morgan Reyes", role: "management", mfa: false },
  { email: "admin@inssnapp.demo", fullName: "Avery Chen", role: "inssnapp_admin", mfa: true },
  { email: "resident@inssnapp.demo", fullName: "Jordan Lee", role: "resident", mfa: false },
  { email: "prospect@inssnapp.demo", fullName: "Taylor Brooks", role: "prospect", mfa: false },
  { email: "broker@inssnapp.demo", fullName: "Casey Kim", role: "broker", mfa: false },
  { email: "manager2@inssnapp.demo", fullName: "Riley Park", role: "management", mfa: false, org: 1 },
] as const;

// TASK-003: portfolio + resident links so the Postgres path exercises the
// same showing lifecycle as the in-memory seed (mirrors apps/web/lib/store.ts).
const DEMO_PROPERTIES = [
  { name: "The Alder", address: "120 Alder St, Seattle, WA", org: 0 },
  { name: "Maple Court", address: "88 Maple Ave, Bellevue, WA", org: 0 },
  { name: "Harbor Lofts", address: "1 Harbor Blvd, Tacoma, WA", org: 1 },
] as const;

const DEMO_UNITS: {
  label: string;
  property: number;
  eligible: boolean;
  residentAvailable: boolean;
  residentEmail?: string;
}[] = [
  { label: "4B", property: 0, eligible: true, residentAvailable: true, residentEmail: "resident@inssnapp.demo" },
  { label: "2A", property: 0, eligible: true, residentAvailable: true, residentEmail: "resident@inssnapp.demo" },
  { label: "1C", property: 1, eligible: true, residentAvailable: false },
  { label: "PH1", property: 2, eligible: true, residentAvailable: true },
];

export async function seedDemo(store: PostgresStore): Promise<void> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const orgIds: string[] = [];
  for (const org of DEMO_ORGS) {
    const existing = await pool.query(`SELECT id FROM organizations WHERE name = $1`, [org.name]);
    if (existing.rows[0]) {
      orgIds.push(existing.rows[0].id);
    } else {
      const res = await pool.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [
        org.name,
      ]);
      orgIds.push(res.rows[0].id);
    }
  }

  // One hash for all demo accounts (same password "pw"); salt is embedded.
  const passwordHash = await hashPassword("pw");
  for (const u of DEMO_USERS) {
    const orgId = orgIds[(u as { org?: number }).org ?? 0];
    await pool.query(
      `INSERT INTO users
         (organization_id, email, full_name, password_hash, role, mfa_enabled, mfa_secret)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, email) DO NOTHING`,
      [
        orgId,
        u.email,
        u.fullName,
        passwordHash,
        u.role,
        u.mfa,
        u.mfa ? DEMO_TOTP_SECRET : null,
      ],
    );
  }

  await seedPortfolio(pool, orgIds);

  await pool.end();
  console.log(`Seeded ${DEMO_ORGS.length} orgs and ${DEMO_USERS.length} demo users (password: pw).`);
}

async function seedPortfolio(pool: any, orgIds: string[]): Promise<void> {
  const propertyIds: string[] = [];
  for (const p of DEMO_PROPERTIES) {
    const orgId = orgIds[p.org];
    const existing = await pool.query(
      `SELECT id FROM properties WHERE organization_id = $1 AND name = $2`,
      [orgId, p.name],
    );
    if (existing.rows[0]) {
      propertyIds.push(existing.rows[0].id);
    } else {
      const res = await pool.query(
        `INSERT INTO properties (organization_id, name, address) VALUES ($1, $2, $3) RETURNING id`,
        [orgId, p.name, p.address],
      );
      propertyIds.push(res.rows[0].id);
    }
  }

  for (const u of DEMO_UNITS) {
    const propertyId = propertyIds[u.property];
    const orgId = orgIds[DEMO_PROPERTIES[u.property].org];
    const existing = await pool.query(
      `SELECT id FROM units WHERE property_id = $1 AND label = $2`,
      [propertyId, u.label],
    );
    let unitId: string;
    if (existing.rows[0]) {
      unitId = existing.rows[0].id;
    } else {
      const res = await pool.query(
        `INSERT INTO units (organization_id, property_id, label, eligible, resident_available)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orgId, propertyId, u.label, u.eligible, u.residentAvailable],
      );
      unitId = res.rows[0].id;
    }
    if (u.residentEmail) {
      const userRes = await pool.query(
        `SELECT id FROM users WHERE organization_id = $1 AND email = $2`,
        [orgId, u.residentEmail],
      );
      if (userRes.rows[0]) {
        await pool.query(
          `INSERT INTO residents (organization_id, user_id, unit_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, unit_id) DO NOTHING`,
          [orgId, userRes.rows[0].id, unitId],
        );
      }
    }
  }
  console.log(`Seeded ${DEMO_PROPERTIES.length} properties and ${DEMO_UNITS.length} units (+ resident links).`);
}

async function main(): Promise<void> {
  if (!usingPostgres) {
    console.error("DATABASE_URL is not set. PostgreSQL is required for seeding.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }
  await seedDemo(new PostgresStore());
}

// Run only when executed directly (`npm run db:seed`), not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
