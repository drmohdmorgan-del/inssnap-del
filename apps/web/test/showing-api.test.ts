/**
 * TASK-003 — API route tests for the persistent Showing Engine.
 *
 * Drives the named showing routes through their real Next.js route
 * handlers (in-memory store path; the PostgreSQL path is covered by
 * packages/db/test/showing-store.pg.test.ts): full lifecycle, broker
 * gate, invalid transitions, idempotent retries, cross-org isolation,
 * concurrent double-booking protection, and audit-trail completeness.
 *
 * Skipped when DATABASE_URL is set — these tests pin the in-memory
 * fallback path. Run with no DATABASE_URL in the environment.
 */

import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { POST as requestPOST } from "../app/api/showings/request/route";
import { POST as idRequestPOST } from "../app/api/showings/[id]/request/route";
import { POST as residentAcceptPOST } from "../app/api/showings/[id]/resident/accept/route";
import { POST as residentDeclinePOST } from "../app/api/showings/[id]/resident/decline/route";
import { POST as brokerAssignPOST } from "../app/api/showings/[id]/broker/assign/route";
import { POST as brokerAcceptPOST } from "../app/api/showings/[id]/broker/accept/route";
import { POST as confirmPOST } from "../app/api/showings/[id]/confirm/route";
import { POST as checkInPOST } from "../app/api/showings/[id]/check-in/route";
import { POST as completePOST } from "../app/api/showings/[id]/complete/route";
import { POST as outcomePOST } from "../app/api/showings/[id]/outcome/route";
import { GET as eventsGET } from "../app/api/events/route";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<NextResponse>;

async function loginAs(email: string): Promise<string> {
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "pw" }),
  });
  const res = await loginPOST(req);
  expect(res.status, `login as ${email}`).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("=");
  return setCookie.split(";")[0];
}

function post(path: string, cookie: string | null, body: unknown, id?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const req = new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { req };
}

async function call(
  handler: Handler,
  showingId: string,
  cookie: string | null,
  body: unknown = {},
): Promise<{ status: number; json: any }> {
  const { req } = post(`/api/showings/${showingId}/x`, cookie, body);
  const res = await handler(req, { params: Promise.resolve({ id: showingId }) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function callCollection(
  handler: (req: NextRequest) => Promise<NextResponse>,
  path: string,
  cookie: string | null,
  body: unknown = {},
): Promise<{ status: number; json: any }> {
  const { req } = post(path, cookie, body);
  const res = await handler(req);
  return { status: res.status, json: await res.json().catch(() => null) };
}

describeMem("showing API routes (TASK-003, in-memory path)", () => {
  it("requires authentication", async () => {
    const { req } = post("/api/showings/xyz/request", null, {});
    const res = await idRequestPOST(req, { params: Promise.resolve({ id: "xyz" }) });
    expect(res.status).toBe(401);
  });

  it("runs the full lifecycle through the named routes", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");

    // Prospect creates the request for unit_1.
    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_1",
      idempotencyKey: "api-e2e-req-1",
    });
    expect(created.status).toBe(201);
    expect(created.json.showing.state).toBe("REQUESTED");
    const id = created.json.showing.id as string;

    const accepted = await call(residentAcceptPOST, id, resident, { idempotencyKey: "api-e2e-accept-1" });
    expect(accepted.status).toBe(200);
    expect(accepted.json.showing.state).toBe("RESIDENT_ACCEPTED");

    const confirmed = await call(confirmPOST, id, manager, { idempotencyKey: "api-e2e-confirm-1" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.showing.state).toBe("CONFIRMED");

    const checkedIn = await call(checkInPOST, id, resident, {});
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.json.showing.state).toBe("IN_PROGRESS");

    const completed = await call(completePOST, id, resident, {});
    expect(completed.status).toBe(200);
    expect(completed.json.showing.state).toBe("COMPLETED");

    const outcome = await call(outcomePOST, id, prospect, { outcome: "APPLY" });
    expect(outcome.status).toBe(200);
    expect(outcome.json.showing.state).toBe("OUTCOME");
    expect(outcome.json.showing.outcome).toBe("APPLY");

    // Audit trail: 6 immutable events, each with actor/org/state change.
    const headers: Record<string, string> = { cookie: manager };
    const eventsRes = await eventsGET(new NextRequest("http://localhost/api/events", { headers }));
    expect(eventsRes.status).toBe(200);
    const { events } = (await eventsRes.json()) as { events: any[] };
    const mine = events.filter((e) => e.showingId === id);
    expect(mine).toHaveLength(6);
    for (const e of mine) {
      expect(e.organizationId).toBe("org_1");
      expect(e.actorUserId).toBeTruthy();
      expect(e.actorRole).toBeTruthy();
      expect(e.fromState).not.toBe(e.toState);
      expect(e.at).toBeTruthy();
    }
    expect(mine.map((e) => e.transition).sort()).toEqual(
      ["CHECK_IN", "COMPLETE", "CONFIRM", "PROSPECT_REQUEST", "RECORD_OUTCOME", "RESIDENT_ACCEPT"].sort(),
    );
  });

  it("runs the broker gate: assign → accept → confirm → check-in → complete", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");
    const broker = await loginAs("broker@inssnapp.demo");

    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_1",
      idempotencyKey: "api-e2e-broker-req",
    });
    expect(created.status).toBe(201);
    const id = created.json.showing.id as string;

    await call(residentAcceptPOST, id, resident, {});
    const assigned = await call(brokerAssignPOST, id, manager, { brokerUserId: "u_broker" });
    expect(assigned.status).toBe(200);
    expect(assigned.json.showing.state).toBe("BROKER_GATE");
    expect(assigned.json.showing.brokerUserId).toBe("u_broker");

    const accepted = await call(brokerAcceptPOST, id, broker, {});
    expect(accepted.status).toBe(200);
    expect(accepted.json.showing.state).toBe("CONFIRMED");

    const checkedIn = await call(checkInPOST, id, broker, {});
    expect(checkedIn.json.showing.state).toBe("IN_PROGRESS");
    const completed = await call(completePOST, id, broker, {});
    expect(completed.json.showing.state).toBe("COMPLETED");
    const outcome = await call(outcomePOST, id, prospect, { outcome: "WATCH" });
    expect(outcome.json.showing.outcome).toBe("WATCH");
  });

  it("rejects invalid transitions and wrong roles", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");

    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_2",
      idempotencyKey: "api-e2e-invalid-req",
    });
    const id = created.json.showing.id as string;

    // Prospect may not accept (route-level role gate).
    const wrongRole = await call(residentAcceptPOST, id, prospect, {});
    expect(wrongRole.status).toBe(403);

    // Manager may not confirm from REQUESTED (engine legality).
    const illegal = await call(confirmPOST, id, manager, {});
    expect(illegal.status).toBe(400);
    expect(illegal.json.code).toBe("ILLEGAL_TRANSITION");

    // Outcome requires a valid enum value.
    const badOutcome = await call(outcomePOST, id, prospect, { outcome: "MAYBE" });
    expect(badOutcome.status).toBe(400);

    // Broker assignment requires a real broker in the org.
    const badBroker = await call(brokerAssignPOST, id, manager, { brokerUserId: "u_prospect" });
    expect(badBroker.status).toBe(400);

    // Resident declines instead — showing returns to AVAILABLE.
    const resident = await loginAs("resident@inssnapp.demo");
    const declined = await call(residentDeclinePOST, id, resident, {});
    expect(declined.status).toBe(200);
    expect(declined.json.showing.state).toBe("AVAILABLE");
  });

  it("replays idempotent retries without duplicating transitions", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");

    const first = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_2",
      idempotencyKey: "api-e2e-idem-1",
    });
    expect(first.status).toBe(201);
    const id = first.json.showing.id as string;

    const retry = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_2",
      idempotencyKey: "api-e2e-idem-1",
    });
    expect(retry.status).toBe(200);
    expect(retry.json.replayed).toBe(true);
    expect(retry.json.showing.id).toBe(id);

    const headers: Record<string, string> = { cookie: manager };
    const eventsRes = await eventsGET(new NextRequest("http://localhost/api/events", { headers }));
    const { events } = (await eventsRes.json()) as { events: any[] };
    expect(events.filter((e) => e.showingId === id)).toHaveLength(1);
  });

  it("returns 404 for cross-org access", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const otherManager = await loginAs("manager2@inssnapp.demo"); // org_2

    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_2",
      idempotencyKey: "api-e2e-xorg-req",
    });
    const id = created.json.showing.id as string;

    const res = await call(confirmPOST, id, otherManager, {});
    expect(res.status).toBe(404);
    expect(res.json.error).toBe("Showing not found.");
  });

  it("prevents double-booking under concurrent CONFIRM", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");

    const mk = async (key: string) => {
      const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
        unitId: "unit_2",
        idempotencyKey: key,
      });
      const id = created.json.showing.id as string;
      await call(residentAcceptPOST, id, resident, {});
      return id;
    };
    const a = await mk("api-e2e-conc-a");
    const b = await mk("api-e2e-conc-b");

    const [ra, rb] = await Promise.all([
      call(confirmPOST, a, manager, {}),
      call(confirmPOST, b, manager, {}),
    ]);
    const oks = [ra, rb].filter((r) => r.status === 200);
    const locked = [ra, rb].filter((r) => r.status === 409 && r.json.code === "UNIT_LOCKED");
    expect(oks).toHaveLength(1);
    expect(locked).toHaveLength(1);
  });

  it("refuses requests for units that are not available", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    // unit_3: eligible but residentAvailable = false.
    const res = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_3",
    });
    expect(res.status).toBe(400);

    // Unknown unit → 404.
    const missing = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_nope",
    });
    expect(missing.status).toBe(404);
  });

  it("still serves the generic transition route", async () => {
    const { POST: genericPOST } = await import("../app/api/showings/[id]/transition/route");
    const prospect = await loginAs("prospect@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");

    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_2",
      idempotencyKey: "api-e2e-generic-req",
    });
    const id = created.json.showing.id as string;

    const { req } = post(`/api/showings/${id}/transition`, resident, {
      transition: "RESIDENT_ACCEPT",
      idempotencyKey: "api-e2e-generic-accept",
    });
    const res = await genericPOST(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).showing.state).toBe("RESIDENT_ACCEPTED");
  });
});
