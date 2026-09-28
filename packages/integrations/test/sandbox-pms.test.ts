/**
 * TASK-008 — PMS adapter interface conformance + sync idempotency tests.
 *
 * The sandbox adapter is exercised through the vendor-neutral PmsAdapter
 * interface (never its concrete class, except construction), proving the
 * boundary holds: connect → health → list → runPmsSync → idempotent re-run.
 * A fake in-memory PmsSyncTarget stands in for the application's store.
 */

import { describe, expect, it } from "vitest";
import {
  runPmsSync,
  SandboxPmsAdapter,
  SANDBOX_ADAPTER_TYPE,
  type PmsAdapter,
  type PmsProperty,
  type PmsResidentRosterEntry,
  type PmsSyncTarget,
  type PmsUnit,
} from "../src/index";

/** Minimal in-memory PmsSyncTarget with external-id-keyed upserts. */
function makeTarget() {
  const properties = new Map<string, { id: string; org: string; p: PmsProperty }>();
  const units = new Map<string, { id: string; org: string; propertyId: string; u: PmsUnit }>();
  const links = new Set<string>(); // `${userEmail}::${unitId}`
  const users = new Map<string, { email: string; org: string }>();
  let seq = 0;
  const seenOrgs = new Set<string>();

  const target: PmsSyncTarget = {
    async upsertProperty(org, p) {
      seenOrgs.add(org);
      const key = `${org}::${p.externalId}`;
      const existing = properties.get(key);
      if (existing) return { id: existing.id, created: false };
      seq += 1;
      const id = `prop_${seq}`;
      properties.set(key, { id, org, p });
      return { id, created: true };
    },
    async upsertUnit(org, propertyId, u) {
      seenOrgs.add(org);
      const key = `${org}::${u.propertyExternalId}::${u.externalId}`;
      const existing = units.get(key);
      if (existing) return { id: existing.id, created: false };
      seq += 1;
      const id = `unit_${seq}`;
      units.set(key, { id, org, propertyId, u });
      return { id, created: true };
    },
    async linkResident(org, unitId, r) {
      seenOrgs.add(org);
      const user = [...users.values()].find(
        (x) => x.org === org && x.email.toLowerCase() === r.email.toLowerCase(),
      );
      if (!user) return "no_user";
      const key = `${user.email}::${unitId}`;
      if (links.has(key)) return "already_linked";
      links.add(key);
      return "linked";
    },
  };
  return {
    target,
    properties,
    units,
    links,
    seenOrgs,
    addUser: (email: string, org: string) => users.set(email, { email, org }),
  };
}

async function connectedAdapter(config: Record<string, unknown> = {}): Promise<PmsAdapter> {
  const adapter: PmsAdapter = new SandboxPmsAdapter();
  await adapter.connect(config);
  return adapter;
}

describe("SandboxPmsAdapter — interface conformance", () => {
  it("reports adapterType 'sandbox' and requires connect() before use", async () => {
    const adapter = new SandboxPmsAdapter();
    expect(adapter.adapterType).toBe(SANDBOX_ADAPTER_TYPE);
    await expect(adapter.listProperties("org_x")).rejects.toThrow(/connect/);
    await connectedAdapter();
  });

  it("rejects an unknown dataset at connect time", async () => {
    const adapter = new SandboxPmsAdapter();
    await expect(adapter.connect({ dataset: "nope" })).rejects.toThrow(/unknown dataset/);
  });

  it("lists fixture properties, units per property, and the roster", async () => {
    const adapter = await connectedAdapter({ vendor: "yardi", dataset: "sandbox-default" });
    const props = await adapter.listProperties("org_x");
    expect(props.length).toBe(2);
    expect(props[0].externalId).toBe("YRD-P-9001");

    const units = await adapter.listUnits("org_x", "YRD-P-9001");
    expect(units.map((u) => u.externalId).sort()).toEqual(["YRD-U-90011", "YRD-U-90012"]);
    expect(await adapter.listUnits("org_x", "YRD-P-9002")).toHaveLength(1);
    expect(await adapter.listUnits("org_x", "nope")).toHaveLength(0);

    const roster = await adapter.listResidentRoster("org_x");
    expect(roster.length).toBe(2);
    expect(roster[0].unitExternalId).toBe("YRD-U-90011");
  });

  it("healthCheck reports ok with a timestamp", async () => {
    const adapter = await connectedAdapter();
    const health = await adapter.healthCheck("org_x");
    expect(health.ok).toBe(true);
    expect(typeof health.latencyMs).toBe("number");
    expect(new Date(health.checkedAt).getTime()).not.toBeNaN();
  });

  it("healthCheck reports failure when configured to (error-path knob)", async () => {
    const adapter = await connectedAdapter({ failHealth: true });
    const health = await adapter.healthCheck("org_x");
    expect(health.ok).toBe(false);
  });
});

describe("runPmsSync — idempotent apply through the target", () => {
  it("syncs properties, units, and the resident roster on first run", async () => {
    const adapter = await connectedAdapter();
    const t = makeTarget();
    t.addUser("resident@inssnapp.demo", "org_1");

    const result = await runPmsSync(adapter, "org_1", t.target);

    expect(result.ok).toBe(true);
    expect(result.adapterType).toBe("sandbox");
    expect(result.organizationId).toBe("org_1");
    expect(result.properties).toEqual({ created: 2, updated: 0 });
    expect(result.units).toEqual({ created: 3, updated: 0 });
    expect(result.residents.linked).toBe(1);
    expect(result.residents.skippedNoUser).toBe(1);
    expect(result.residents.skippedNoUnit).toBe(0);
    expect(result.errors).toEqual([]);
    expect(t.properties.size).toBe(2);
    expect(t.units.size).toBe(3);

    // Synced units keep vendor external ids and eligibility from the PMS.
    const unit = [...t.units.values()].find((x) => x.u.externalId === "YRD-U-90011");
    expect(unit?.u.eligible).toBe(true);
    expect(unit?.u.label).toBe("1A");
  });

  it("re-sync is idempotent: no duplicates, updates counted as updates", async () => {
    const adapter = await connectedAdapter();
    const t = makeTarget();
    t.addUser("resident@inssnapp.demo", "org_1");

    const first = await runPmsSync(adapter, "org_1", t.target);
    expect(first.ok).toBe(true);
    const second = await runPmsSync(adapter, "org_1", t.target);

    expect(second.ok).toBe(true);
    expect(second.properties).toEqual({ created: 0, updated: 2 });
    expect(second.units).toEqual({ created: 0, updated: 3 });
    // The roster link already exists — steady state, not an error, not re-counted.
    expect(second.residents.linked).toBe(0);
    expect(second.residents.skippedNoUser).toBe(1);
    expect(t.properties.size).toBe(2);
    expect(t.units.size).toBe(3);
    expect(t.links.size).toBe(1);
  });

  it("keeps organizations isolated: syncing org B never touches org A's data", async () => {
    const adapter = await connectedAdapter();
    const t = makeTarget();
    t.addUser("resident@inssnapp.demo", "org_1");

    await runPmsSync(adapter, "org_1", t.target);
    await runPmsSync(adapter, "org_2", t.target);

    expect(t.seenOrgs).toEqual(new Set(["org_1", "org_2"]));
    const org1Props = [...t.properties.values()].filter((x) => x.org === "org_1");
    const org2Props = [...t.properties.values()].filter((x) => x.org === "org_2");
    expect(org1Props).toHaveLength(2);
    expect(org2Props).toHaveLength(2);
    // org_2 has no demo resident user, so its roster links nothing.
    expect(t.links.size).toBe(1);
  });

  it("collects per-row errors without aborting the run", async () => {
    const adapter = await connectedAdapter();
    const t = makeTarget();
    const failing: PmsSyncTarget = {
      ...t.target,
      upsertUnit: async (org, propertyId, u) => {
        if (u.externalId === "YRD-U-90012") throw new Error("boom");
        return t.target.upsertUnit(org, propertyId, u);
      },
    };

    const result = await runPmsSync(adapter, "org_1", failing);
    expect(result.ok).toBe(true);
    expect(result.errors.some((e) => e.includes("YRD-U-90012"))).toBe(true);
    expect(result.units.created).toBe(2);
  });

  it("fails closed when the fetch phase throws", async () => {
    const adapter = await connectedAdapter();
    const broken: PmsAdapter = {
      ...adapter,
      adapterType: adapter.adapterType,
      listProperties: async () => {
        throw new Error("PMS is down");
      },
    };
    const t = makeTarget();
    const result = await runPmsSync(broken, "org_1", t.target);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("PMS is down"))).toBe(true);
    expect(t.properties.size).toBe(0);
  });
});
