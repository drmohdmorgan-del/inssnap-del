/**
 * TASK-003 — Postgres persistence tests for the Showing Engine.
 *
 * Exercises ShowingEngine + PostgresStore against a real PostgreSQL:
 * full lifecycle, invalid transitions, idempotent retries, tenant
 * isolation, audit-trail completeness, and concurrent CONFIRM
 * double-booking protection via the unit/showing lock.
 *
 * Requires DATABASE_URL (the local dev database `inssnapp_test`).
 * Skipped in CI, where no database is provisioned.
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ShowingEngine } from "@inssnapp/engine";
import type { Actor, Transition } from "@inssnapp/engine";
import { PostgresStore } from "../src/client.ts";

const describePg = describe.skipIf(!process.env.DATABASE_URL);

describePg("PostgresStore + ShowingEngine (TASK-003)", () => {
  let pool: any;
  let store: PostgresStore;
  let engine: ShowingEngine;

  // Fixture ids.
  let orgA = "";
  let orgB = "";
  let unitA = "";
  let mgmtA = "";
  let residentA = "";
  let prospectA = "";
  let brokerA = "";
  let mgmtB = "";

  const actor = (role: string, org = orgA, userId = ""): Actor => ({
    userId: userId || `${role}_${org}`,
    role: role as Actor["role"],
    organizationId: org,
  });

  async function createShowing(unitId: string, residentUserId: string, org: string): Promise<string> {
    const res = await pool.query(
      `INSERT INTO showings (organization_id, unit_id, resident_user_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [org, unitId, residentUserId],
    );
    return res.rows[0].id as string;
  }

  async function transition(
    showingId: string,
    transition: Transition,
    a: Actor,
    key: string,
    extra: { outcome?: "APPLY" | "WATCH" | "DECLINE"; brokerUserId?: string } = {},
  ) {
    return engine.transition({
      showingId,
      transition,
      actor: a,
      idempotencyKey: key,
      ...extra,
    });
  }

  async function toAccepted(showingId: string, prospectUser: string) {
    const r1 = await transition(showingId, "PROSPECT_REQUEST", actor("prospect", orgA, prospectUser), `${showingId}-req`);
    expect(r1.ok).toBe(true);
    const r2 = await transition(showingId, "RESIDENT_ACCEPT", actor("resident", orgA, residentA), `${showingId}-accept`);
    expect(r2.ok).toBe(true);
  }

  async function eventCount(showingId: string): Promise<number> {
    const res = await pool.query(`SELECT count(*)::int AS n FROM showing_events WHERE showing_id = $1`, [showingId]);
    return res.rows[0].n;
  }

  beforeAll(async () => {
    const { default: pg } = await import("pg");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    store = new PostgresStore();
    engine = new ShowingEngine(store);

    const orgName = `TASK-003 test org ${Date.now()}`;
    orgA = (await pool.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [orgName])).rows[0].id;
    orgB = (await pool.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`${orgName} B`])).rows[0].id;

    async function mkUser(org: string, email: string, role: string): Promise<string> {
      const res = await pool.query(
        `INSERT INTO users (organization_id, email, full_name, password_hash, role)
         VALUES ($1, $2, $3, 'x', $4) RETURNING id`,
        [org, `${Date.now()}-${email}`, email, role],
      );
      return res.rows[0].id;
    }
    mgmtA = await mkUser(orgA, "mgmt@t3.test", "management");
    residentA = await mkUser(orgA, "resident@t3.test", "resident");
    prospectA = await mkUser(orgA, "prospect@t3.test", "prospect");
    brokerA = await mkUser(orgA, "broker@t3.test", "broker");
    mgmtB = await mkUser(orgB, "mgmt@other.test", "management");

    const prop = (await pool.query(
      `INSERT INTO properties (organization_id, name, address) VALUES ($1, 'T3 Towers', '1 Test Way') RETURNING id`,
      [orgA],
    )).rows[0].id;
    unitA = (await pool.query(
      `INSERT INTO units (organization_id, property_id, label, eligible, resident_available)
       VALUES ($1, $2, 'T3-1', true, true) RETURNING id`,
      [orgA, prop],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO residents (organization_id, user_id, unit_id) VALUES ($1, $2, $3)`,
      [orgA, residentA, unitA],
    );
  });

  afterAll(async () => {
    // Cascades to users, units, showings, events, locks.
    await pool.query(`DELETE FROM organizations WHERE id = ANY($1)`, [[orgA, orgB]]);
    await pool.end();
  });

  it("runs the full lifecycle with broker gate and a complete audit trail", async () => {
    const id = await createShowing(unitA, residentA, orgA);
    // Note: BROKER_ACCEPT lands directly in CONFIRMED (per the transition
    // table) and acquires the unit lock; there is no separate CONFIRM step
    // on the broker path.
    const steps: [Transition, Actor, object][] = [
      ["PROSPECT_REQUEST", actor("prospect", orgA, prospectA), {}],
      ["RESIDENT_ACCEPT", actor("resident", orgA, residentA), {}],
      ["BROKER_ASSIGN", actor("management", orgA, mgmtA), { brokerUserId: brokerA }],
      ["BROKER_ACCEPT", actor("broker", orgA, brokerA), {}],
      ["CHECK_IN", actor("broker", orgA, brokerA), {}],
      ["COMPLETE", actor("broker", orgA, brokerA), {}],
      ["RECORD_OUTCOME", actor("prospect", orgA, prospectA), { outcome: "APPLY" as const }],
    ];
    const expectedStates = [
      "REQUESTED", "RESIDENT_ACCEPTED", "BROKER_GATE", "CONFIRMED",
      "IN_PROGRESS", "COMPLETED", "OUTCOME",
    ];
    for (let i = 0; i < steps.length; i++) {
      const [t, a, extra] = steps[i];
      const res = await transition(id, t, a, `full-${id}-${t}`, extra);
      expect(res.ok, `${t} should succeed`).toBe(true);
      if (res.ok) expect(res.showing.state).toBe(expectedStates[i]);
    }

    const final = await store.getShowing(id);
    expect(final?.outcome).toBe("APPLY");

    // Audit trail: one immutable event per material transition, with
    // actor, org, timestamp, and the state change.
    const res = await pool.query(
      `SELECT transition, actor_role AS "actorRole", organization_id AS "organizationId",
              from_state AS "fromState", to_state AS "toState", at
       FROM showing_events WHERE showing_id = $1 ORDER BY at ASC`,
      [id],
    );
    expect(res.rows).toHaveLength(7);
    for (const row of res.rows) {
      expect(row.organizationId).toBe(orgA);
      expect(row.actorRole).toBeTruthy();
      expect(row.at).toBeTruthy();
      expect(row.fromState).not.toBe(row.toState);
    }
    expect(res.rows.map((r: any) => r.transition)).toEqual([
      "PROSPECT_REQUEST", "RESIDENT_ACCEPT", "BROKER_ASSIGN", "BROKER_ACCEPT",
      "CHECK_IN", "COMPLETE", "RECORD_OUTCOME",
    ]);
  });

  it("rejects illegal transitions and enforces the role policy", async () => {
    const id = await createShowing(unitA, residentA, orgA);
    const illegal = await transition(id, "CHECK_IN", actor("resident", orgA, residentA), `ill-${id}`);
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.code).toBe("ILLEGAL_TRANSITION");

    const r1 = await transition(id, "PROSPECT_REQUEST", actor("prospect", orgA, prospectA), `role-${id}`);
    expect(r1.ok).toBe(true);
    const wrongRole = await transition(id, "RESIDENT_ACCEPT", actor("prospect", orgA, prospectA), `role2-${id}`);
    expect(wrongRole.ok).toBe(false);
    if (!wrongRole.ok) expect(wrongRole.code).toBe("ROLE_FORBIDDEN");
  });

  it("rejects cross-tenant access", async () => {
    const id = await createShowing(unitA, residentA, orgA);
    const res = await transition(id, "PROSPECT_REQUEST", actor("prospect", orgB, "x"), `xorg-${id}`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TENANT_ISOLATION");
    expect(await eventCount(id)).toBe(0);
  });

  it("replays idempotent retries without duplicating transitions", async () => {
    const id = await createShowing(unitA, residentA, orgA);
    const req = {
      showingId: id,
      transition: "PROSPECT_REQUEST" as Transition,
      actor: actor("prospect", orgA, prospectA),
      idempotencyKey: `idem-${id}`,
    };
    const first = await engine.transition(req);
    const second = await engine.transition(req);
    expect(first.ok && second.ok).toBe(true);
    if (second.ok) expect(second.replayed).toBe(true);
    expect(await eventCount(id)).toBe(1);
  });

  it("acquires the unit lock atomically under concurrent attempts", async () => {
    // Store-level primitive: two simultaneous acquisitions for the same
    // unit serialize on INSERT ... ON CONFLICT — exactly one wins.
    const unit2 = (
      await pool.query(
        `INSERT INTO units (organization_id, property_id, label, eligible, resident_available)
         SELECT $1, id, 'T3-atomic', true, true FROM properties WHERE organization_id = $1 LIMIT 1
         RETURNING id`,
        [orgA],
      )
    ).rows[0].id;
    const shx = await createShowing(unit2, residentA, orgA);
    const shy = await createShowing(unit2, residentA, orgA);
    const results = await Promise.all([
      store.tryAcquireUnitLock(unit2, shx, orgA),
      store.tryAcquireUnitLock(unit2, shy, orgA),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((r) => !r)).toHaveLength(1);
    await store.releaseUnitLock(shx);
    await store.releaseUnitLock(shy);
    expect(await store.getUnitLock(unit2)).toBeNull();
  });

  it("prevents double-booking under concurrent CONFIRM", async () => {
    const a = await createShowing(unitA, residentA, orgA);
    const b = await createShowing(unitA, residentA, orgA);
    await toAccepted(a, prospectA);
    const prospectB = await pool.query(
      `INSERT INTO users (organization_id, email, full_name, password_hash, role)
       VALUES ($1, $2, 'PB', 'x', 'prospect') RETURNING id`,
      [orgA, `${Date.now()}-prospectb@t3.test`],
    );
    await toAccepted(b, prospectB.rows[0].id);

    const [ra, rb] = await Promise.all([
      transition(a, "CONFIRM", actor("management", orgA, mgmtA), `conc-${a}`),
      transition(b, "CONFIRM", actor("management", orgA, mgmtA), `conc-${b}`),
    ]);
    const oks = [ra, rb].filter((r) => r.ok);
    // Exactly one workflow confirms; the other fails closed — either the
    // lock rejects it (UNIT_LOCKED) or it observes the already-moved state
    // (ILLEGAL_TRANSITION). Both are fail-closed per the enforcement order
    // (legality is checked before concurrency).
    const failedClosed = [ra, rb].filter(
      (r) => !r.ok && (r.code === "UNIT_LOCKED" || r.code === "ILLEGAL_TRANSITION"),
    );
    expect(oks).toHaveLength(1);
    expect(failedClosed).toHaveLength(1);

    // Exactly one lock row, held by the winner.
    const winner = (oks[0] as { ok: true; showing: { id: string } }).showing.id;
    const lock = await store.getUnitLock(unitA);
    expect(lock?.showingId).toBe(winner);

    try {
      // The loser is untouched by the lock and holds no lock.
      const loserId = winner === a ? b : a;
      expect(await eventCount(loserId)).toBe(2); // request + accept only

      // Completing the winner releases the lock; the loser can then confirm.
      await transition(winner, "CHECK_IN", actor("resident", orgA, residentA), `conc-${winner}-in`);
      const done = await transition(winner, "COMPLETE", actor("resident", orgA, residentA), `conc-${winner}-done`);
      expect(done.ok).toBe(true);
      expect(await store.getUnitLock(unitA)).toBeNull();

      const retry = await transition(loserId, "CONFIRM", actor("management", orgA, mgmtA), `conc-${loserId}-retry`);
      expect(retry.ok).toBe(true);
      expect((await store.getUnitLock(unitA))?.showingId).toBe(loserId);
      // Clean up: release the lock for subsequent tests.
      await transition(loserId, "CHECK_IN", actor("resident", orgA, residentA), `conc-${loserId}-in`);
      await transition(loserId, "COMPLETE", actor("resident", orgA, residentA), `conc-${loserId}-done`);
      expect(await store.getUnitLock(unitA)).toBeNull();
    } finally {
      // Never leak a lock into later tests, even on assertion failure.
      await store.releaseUnitLock(a);
      await store.releaseUnitLock(b);
    }
  });

  it("releases the lock when the state write loses the version race", async () => {
    const id = await createShowing(unitA, residentA, orgA);
    await toAccepted(id, prospectA);
    // Simulate a concurrent writer slipping in between the engine's read
    // and its version-checked commit: the commit must fail and the
    // just-acquired lock must be released (no orphan lock).
    const racingStore = {
      getShowing: store.getShowing.bind(store),
      insertEvent: store.insertEvent.bind(store),
      getIdempotent: store.getIdempotent.bind(store),
      tryAcquireUnitLock: store.tryAcquireUnitLock.bind(store),
      releaseUnitLock: store.releaseUnitLock.bind(store),
      commitShowing: async (
        sid: string,
        version: number,
        patch: Parameters<PostgresStore["commitShowing"]>[2],
      ) => {
        await pool.query(`UPDATE showings SET version = version + 1 WHERE id = $1`, [sid]);
        return store.commitShowing(sid, version, patch);
      },
    };
    const racingEngine = new ShowingEngine(racingStore);
    const res = await racingEngine.transition({
      showingId: id,
      transition: "CONFIRM",
      actor: actor("management", orgA, mgmtA),
      idempotencyKey: `race-${id}`,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONCURRENCY_CONFLICT");
    expect(await store.getUnitLock(unitA)).toBeNull();
  });
});
