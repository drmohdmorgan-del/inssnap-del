/**
 * TASK-004/006 — Postgres-path tests for the mobile backend data layer.
 *
 * Exercises db.residents.byUser / byUserDetailed and db.ratings.insert /
 * byShowing against the real PostgreSQL schema (incl. the new
 * showing_ratings table), plus the UNIQUE(showing_id, rater_user_id)
 * fail-closed net.
 *
 * Requires DATABASE_URL (the local dev database `inssnapp_test`).
 * Skipped in CI, where no database is provisioned. This is the mirror
 * image of task004-mobile-api.test.ts, which pins the in-memory path.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { db } from "../lib/db";

const describePg = describe.skipIf(!process.env.DATABASE_URL);

describePg("mobile backend data layer (TASK-004/006, Postgres path)", () => {
  let pool: pg.Pool;
  let org = "";
  let otherOrg = "";
  let resident = "";
  let broker = "";
  let unit = "";
  let showing = "";

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const tag = Date.now();
    org = (await pool.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`mobile pg ${tag}`])).rows[0].id;
    otherOrg = (await pool.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`mobile pg other ${tag}`])).rows[0].id;

    const mkUser = async (email: string, role: string) =>
      (await pool.query(
        `INSERT INTO users (organization_id, email, full_name, password_hash, role)
         VALUES ($1, $2, $3, 'x', $4::user_role) RETURNING id`,
        [org, `${tag}-${email}`, email, role],
      )).rows[0].id;
    resident = await mkUser("resident@pg.test", "resident");
    broker = await mkUser("broker@pg.test", "broker");

    const prop = (await pool.query(
      `INSERT INTO properties (organization_id, name, address) VALUES ($1, 'PG Towers', '1 Test Way') RETURNING id`,
      [org],
    )).rows[0].id;
    unit = (await pool.query(
      `INSERT INTO units (organization_id, property_id, label, eligible, resident_available)
       VALUES ($1, $2, 'PG-1', true, true) RETURNING id`,
      [org, prop],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO residents (organization_id, user_id, unit_id, verified) VALUES ($1, $2, $3, true)`,
      [org, resident, unit],
    );
    showing = (await pool.query(
      `INSERT INTO showings (organization_id, unit_id, resident_user_id, broker_user_id, state)
       VALUES ($1, $2, $3, $4, 'COMPLETED'::showing_state) RETURNING id`,
      [org, unit, resident, broker],
    )).rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM organizations WHERE id = ANY($1)`, [[org, otherOrg]]);
    await pool.end();
  });

  it("byUser returns the resident's unit links", async () => {
    const links = await db.residents.byUser(resident);
    expect(links).toHaveLength(1);
    expect(links[0].unitId).toBe(unit);
  });

  it("byUserDetailed returns the verified enrollment, org-scoped", async () => {
    const rows = await db.residents.byUserDetailed(resident, org);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      unitId: unit,
      unitLabel: "PG-1",
      propertyName: "PG Towers",
      eligible: true,
      residentAvailable: true,
      verified: true,
    });
    // Another org sees nothing — no cross-org leak.
    expect(await db.residents.byUserDetailed(resident, otherOrg)).toHaveLength(0);
  });

  it("ratings insert and list round-trip; duplicates fail closed", async () => {
    const rating = await db.ratings.insert({
      organizationId: org,
      showingId: showing,
      raterUserId: resident,
      raterRole: "resident",
      stars: 5,
      comment: "Smooth showing.",
    });
    expect(rating.stars).toBe(5);
    expect(rating.comment).toBe("Smooth showing.");

    const listed = await db.ratings.byShowing(showing);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(rating.id);

    // UNIQUE(showing_id, rater_user_id) — the second rating fails closed.
    await expect(
      db.ratings.insert({
        organizationId: org,
        showingId: showing,
        raterUserId: resident,
        raterRole: "resident",
        stars: 4,
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "23505" });

    // A different rater on the same showing is fine.
    const brokerRating = await db.ratings.insert({
      organizationId: org,
      showingId: showing,
      raterUserId: broker,
      raterRole: "broker",
      stars: 4,
      comment: null,
    });
    expect(brokerRating.stars).toBe(4);
    expect(await db.ratings.byShowing(showing)).toHaveLength(2);
  });
});
