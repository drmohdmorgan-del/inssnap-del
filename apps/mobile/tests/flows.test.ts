/**
 * Unit tests for the role-flow logic (pure functions).
 *
 * Verifies inbox filtering, discovery filtering, per-state action
 * availability, and newest-first ordering for the resident, prospect,
 * and broker experiences.
 */

import { describe, expect, it } from "vitest";
import type { Showing, Unit } from "../src/api/types";
import { brokerActions, brokerQueue } from "../src/flows/broker";
import { residentActions, residentActive, residentHistory, residentInbox } from "../src/flows/resident";
import {
  discoverableUnits,
  prospectActions,
  prospectActiveRequests,
  prospectRequests,
  unitMatchesQuery,
} from "../src/flows/prospect";

function showing(partial: Partial<Showing> & { id: string }): Showing {
  return {
    organizationId: "org_1",
    unitId: "unit_1",
    residentUserId: "u_resident",
    prospectUserId: null,
    brokerUserId: null,
    brokerRequired: false,
    state: "REQUESTED",
    outcome: null,
    version: 1,
    createdAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-28T10:00:00.000Z",
    ...partial,
  };
}

function unit(partial: Partial<Unit> & { id: string }): Unit {
  return {
    organizationId: "org_1",
    propertyId: "prop_1",
    label: "4B",
    pmsExternalId: null,
    eligible: true,
    residentAvailable: true,
    ...partial,
  };
}

describe("resident flow", () => {
  const list = [
    showing({ id: "s_new", state: "REQUESTED", createdAt: "2026-09-28T12:00:00.000Z" }),
    showing({ id: "s_old", state: "REQUESTED", createdAt: "2026-09-28T09:00:00.000Z" }),
    showing({ id: "s_other", state: "REQUESTED", residentUserId: "u_other" }),
    showing({ id: "s_prog", state: "IN_PROGRESS" }),
    showing({ id: "s_done", state: "OUTCOME" }),
  ];

  it("inbox shows only my REQUESTED showings, newest first", () => {
    expect(residentInbox(list, "u_resident").map((s) => s.id)).toEqual(["s_new", "s_old"]);
  });

  it("active shows live states but not closed ones", () => {
    const ids = residentActive(list, "u_resident").map((s) => s.id);
    expect(ids).toContain("s_new");
    expect(ids).toContain("s_prog");
    expect(ids).not.toContain("s_done");
    expect(ids).not.toContain("s_other");
  });

  it("history holds only closed showings", () => {
    expect(residentHistory(list, "u_resident").map((s) => s.id)).toEqual(["s_done"]);
  });

  it("offers the right actions per state", () => {
    expect(residentActions("REQUESTED")).toEqual(["accept", "decline"]);
    expect(residentActions("CONFIRMED")).toEqual(["check-in"]);
    expect(residentActions("IN_PROGRESS")).toEqual(["complete"]);
    expect(residentActions("COMPLETED")).toEqual(["rate"]);
    expect(residentActions("RESIDENT_ACCEPTED")).toEqual([]);
    expect(residentActions("BROKER_GATE")).toEqual([]);
    expect(residentActions("OUTCOME")).toEqual([]);
    expect(residentActions("AVAILABLE")).toEqual([]);
  });
});

describe("prospect flow", () => {
  const units = [
    unit({ id: "u1", label: "4B" }),
    unit({ id: "u2", label: "2A", residentAvailable: false }),
    unit({ id: "u3", label: "1C", eligible: false }),
  ];

  it("discovery shows only eligible units with availability on", () => {
    expect(discoverableUnits(units).map((u) => u.id)).toEqual(["u1"]);
  });

  it("matches search queries against label and PMS id", () => {
    const u = unit({ id: "u9", label: "PH1", pmsExternalId: "APP-30007" });
    expect(unitMatchesQuery(u, "ph")).toBe(true);
    expect(unitMatchesQuery(u, "30007")).toBe(true);
    expect(unitMatchesQuery(u, "zzz")).toBe(false);
    expect(unitMatchesQuery(u, "")).toBe(true);
  });

  const list = [
    showing({ id: "p1", state: "REQUESTED", prospectUserId: "u_prospect" }),
    showing({ id: "p2", state: "COMPLETED", prospectUserId: "u_prospect" }),
    showing({ id: "p3", state: "OUTCOME", prospectUserId: "u_prospect", outcome: "APPLY" }),
    showing({ id: "p4", state: "REQUESTED", prospectUserId: "u_someone_else" }),
  ];

  it("lists my requests", () => {
    expect(prospectRequests(list, "u_prospect").map((s) => s.id)).toEqual(
      expect.arrayContaining(["p1", "p2", "p3"]),
    );
    expect(prospectRequests(list, "u_prospect").map((s) => s.id)).not.toContain("p4");
  });

  it("active requests exclude completed and closed", () => {
    expect(prospectActiveRequests(list, "u_prospect").map((s) => s.id)).toEqual(["p1"]);
  });

  it("offers Apply/Watch/Decline only after completion", () => {
    expect(prospectActions("COMPLETED")).toEqual(["apply", "watch", "decline"]);
    expect(prospectActions("IN_PROGRESS")).toEqual([]);
    expect(prospectActions("OUTCOME")).toEqual([]);
    expect(prospectActions("REQUESTED")).toEqual([]);
  });
});

describe("broker flow", () => {
  const list = [
    showing({ id: "b_gate", state: "BROKER_GATE", brokerUserId: "u_broker" }),
    showing({ id: "b_conf", state: "CONFIRMED", brokerUserId: "u_broker" }),
    showing({ id: "b_prog", state: "IN_PROGRESS", brokerUserId: "u_broker" }),
    showing({ id: "b_done", state: "COMPLETED", brokerUserId: "u_broker" }),
    showing({ id: "b_closed", state: "OUTCOME", brokerUserId: "u_broker" }),
    showing({ id: "b_req", state: "REQUESTED", brokerUserId: "u_broker" }),
    showing({ id: "b_mine_not", state: "BROKER_GATE", brokerUserId: "u_other_broker" }),
  ];

  it("queue shows only my actionable assignments", () => {
    const ids = brokerQueue(list, "u_broker").map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["b_gate", "b_conf", "b_prog", "b_done"]));
    expect(ids).not.toContain("b_closed");
    expect(ids).not.toContain("b_req");
    expect(ids).not.toContain("b_mine_not");
  });

  it("offers the right actions per state", () => {
    expect(brokerActions("BROKER_GATE")).toEqual(["accept-assignment", "decline-assignment"]);
    expect(brokerActions("CONFIRMED")).toEqual(["check-in"]);
    expect(brokerActions("IN_PROGRESS")).toEqual(["complete"]);
    expect(brokerActions("COMPLETED")).toEqual(["rate"]);
    expect(brokerActions("REQUESTED")).toEqual([]);
    expect(brokerActions("OUTCOME")).toEqual([]);
  });
});
