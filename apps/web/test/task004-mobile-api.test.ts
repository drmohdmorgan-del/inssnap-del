/**
 * TASK-004/005/006 — API route tests for the mobile backend additions.
 *
 * Covers the resident self-service endpoints the Expo app wires to
 * (GET /api/residents/me, POST /api/residents/me/availability) and the
 * post-completion rating route (POST /api/showings/[id]/rating), all
 * through their real Next.js route handlers on the in-memory store path.
 *
 * Skipped when DATABASE_URL is set — these tests pin the in-memory
 * fallback path. Run with no DATABASE_URL in the environment.
 */

import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { GET as meGET } from "../app/api/residents/me/route";
import { POST as availabilityPOST } from "../app/api/residents/me/availability/route";
import { POST as requestPOST } from "../app/api/showings/request/route";
import { POST as residentAcceptPOST } from "../app/api/showings/[id]/resident/accept/route";
import { POST as brokerAssignPOST } from "../app/api/showings/[id]/broker/assign/route";
import { POST as brokerAcceptPOST } from "../app/api/showings/[id]/broker/accept/route";
import { POST as confirmPOST } from "../app/api/showings/[id]/confirm/route";
import { POST as checkInPOST } from "../app/api/showings/[id]/check-in/route";
import { POST as completePOST } from "../app/api/showings/[id]/complete/route";
import { POST as ratingPOST } from "../app/api/showings/[id]/rating/route";
import { GET as unitsGET } from "../app/api/units/route";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

type IdHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

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

function authed(session: string | null, body?: unknown): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers.cookie = session;
  return new NextRequest("http://localhost/api/x", {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callId(
  handler: IdHandler,
  id: string,
  session: string | null,
  body: unknown = {},
): Promise<{ status: number; json: any }> {
  const res = await handler(authed(session, body), { params: Promise.resolve({ id }) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

describeMem("resident self-service API (TASK-004, in-memory path)", () => {
  it("GET /api/residents/me requires auth and the resident role", async () => {
    expect((await meGET(authed(null))).status).toBe(401);

    const prospect = await loginAs("prospect@inssnapp.demo");
    expect((await meGET(authed(prospect))).status).toBe(403);

    const manager = await loginAs("manager@inssnapp.demo");
    expect((await meGET(authed(manager))).status).toBe(403);
  });

  it("GET /api/residents/me returns the resident's verified enrollment", async () => {
    const resident = await loginAs("resident@inssnapp.demo");
    const res = await meGET(authed(resident));
    expect(res.status).toBe(200);
    const { enrollments } = (await res.json()) as { enrollments: any[] };
    // Demo seed links the resident to unit_1 (4B) and unit_2 (2A).
    expect(enrollments).toHaveLength(2);
    for (const e of enrollments) {
      expect(e.verified).toBe(true);
      expect(e.unitLabel).toBeTruthy();
      expect(e.propertyName).toBeTruthy();
      expect(typeof e.residentAvailable).toBe("boolean");
    }
  });

  it("POST /api/residents/me/availability toggles the resident's own unit", async () => {
    const resident = await loginAs("resident@inssnapp.demo");

    expect((await availabilityPOST(authed(null, {}))).status).toBe(401);
    const prospect = await loginAs("prospect@inssnapp.demo");
    expect((await availabilityPOST(authed(prospect, {}))).status).toBe(403);

    // Bad input.
    expect((await availabilityPOST(authed(resident, {}))).status).toBe(400);
    expect(
      (await availabilityPOST(authed(resident, { unitId: "unit_1", available: "yes" }))).status,
    ).toBe(400);

    // A unit the resident is not linked to → 404 (no probing).
    expect(
      (await availabilityPOST(authed(resident, { unitId: "unit_3", available: false }))).status,
    ).toBe(404);

    // Toggle OFF then back ON — leaves the seed as found.
    const off = await availabilityPOST(authed(resident, { unitId: "unit_1", available: false }));
    expect(off.status).toBe(200);
    expect((await off.json()).unit.residentAvailable).toBe(false);

    const unitsRes = await unitsGET(authed(resident));
    const units = ((await unitsRes.json()) as { units: any[] }).units;
    expect(units.find((u) => u.id === "unit_1").residentAvailable).toBe(false);

    const on = await availabilityPOST(authed(resident, { unitId: "unit_1", available: true }));
    expect(on.status).toBe(200);
    expect((await on.json()).unit.residentAvailable).toBe(true);
  });

  it("a prospect cannot request a unit whose resident turned availability off", async () => {
    const resident = await loginAs("resident@inssnapp.demo");
    const prospect = await loginAs("prospect@inssnapp.demo");

    const off = await availabilityPOST(authed(resident, { unitId: "unit_2", available: false }));
    expect(off.status).toBe(200);

    const req = new NextRequest("http://localhost/api/showings/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: prospect },
      body: JSON.stringify({ unitId: "unit_2", idempotencyKey: "mobile-avail-gate-1" }),
    });
    const denied = await requestPOST(req);
    expect(denied.status).toBe(400);

    // Restore seed state.
    const on = await availabilityPOST(authed(resident, { unitId: "unit_2", available: true }));
    expect(on.status).toBe(200);

    const req2 = new NextRequest("http://localhost/api/showings/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: prospect },
      body: JSON.stringify({ unitId: "unit_2", idempotencyKey: "mobile-avail-gate-2" }),
    });
    const allowed = await requestPOST(req2);
    expect(allowed.status).toBe(201);
  });
});

describeMem("showing rating API (TASK-004/006, in-memory path)", () => {
  /** Drives a showing to COMPLETED with a broker in the gate. */
  async function completedShowingWithBroker(): Promise<{ id: string; broker: string; resident: string; prospect: string }> {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");
    const broker = await loginAs("broker@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");

    const req = new NextRequest("http://localhost/api/showings/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: prospect },
      body: JSON.stringify({ unitId: "unit_1", idempotencyKey: `mobile-rating-${Date.now()}` }),
    });
    const created = await requestPOST(req);
    expect(created.status).toBe(201);
    const id = (await created.json()).showing.id as string;

    expect((await callId(residentAcceptPOST, id, resident, {})).status).toBe(200);
    const brokerUser = "u_broker";
    expect(
      (await callId(brokerAssignPOST, id, manager, { brokerUserId: brokerUser })).status,
    ).toBe(200);
    expect((await callId(brokerAcceptPOST, id, broker, {})).status).toBe(200);
    expect((await callId(checkInPOST, id, broker, {})).status).toBe(200);
    expect((await callId(completePOST, id, broker, {})).status).toBe(200);
    return { id, broker, resident, prospect };
  }

  it("rejects rating before completion and accepts it after", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");

    const req = new NextRequest("http://localhost/api/showings/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: prospect },
      body: JSON.stringify({ unitId: "unit_1", idempotencyKey: `mobile-rating-early-${Date.now()}` }),
    });
    const created = await requestPOST(req);
    const id = (await created.json()).showing.id as string;

    // REQUESTED → not completed yet.
    expect((await callId(ratingPOST, id, resident, { stars: 5 })).status).toBe(400);

    expect((await callId(residentAcceptPOST, id, resident, {})).status).toBe(200);
    const manager = await loginAs("manager@inssnapp.demo");
    expect((await callId(confirmPOST, id, manager, {})).status).toBe(200);
    expect((await callId(checkInPOST, id, resident, {})).status).toBe(200);
    expect((await callId(completePOST, id, resident, {})).status).toBe(200);

    const rated = await callId(ratingPOST, id, resident, { stars: 5, comment: "On time, courteous." });
    expect(rated.status).toBe(201);
    expect(rated.json.rating.stars).toBe(5);
    expect(rated.json.rating.raterRole).toBe("resident");

    // One rating per rater per showing.
    expect((await callId(ratingPOST, id, resident, { stars: 4 })).status).toBe(409);
  });

  it("validates stars and gates roles and participants", async () => {
    const { id, broker, resident, prospect } = await completedShowingWithBroker();
    const stranger = await loginAs("manager2@inssnapp.demo"); // org_2

    // Non-participant broker of the same org is still forbidden (not the assigned broker).
    expect((await callId(ratingPOST, id, broker, { stars: 0 })).status).toBe(400);
    expect((await callId(ratingPOST, id, broker, { stars: 6 })).status).toBe(400);
    expect((await callId(ratingPOST, id, broker, { stars: 4.5 })).status).toBe(400);
    expect((await callId(ratingPOST, id, broker, { stars: 4, comment: "x".repeat(501) })).status).toBe(
      400,
    );

    // Prospect participated but only resident/broker may rate.
    expect((await callId(ratingPOST, id, prospect, { stars: 5 })).status).toBe(403);

    // Cross-org → 404, no probing.
    expect((await callId(ratingPOST, id, stranger, { stars: 5 })).status).toBe(404);

    // The assigned broker rates successfully.
    const rated = await callId(ratingPOST, id, broker, { stars: 4 });
    expect(rated.status).toBe(201);
    expect(rated.json.rating.raterRole).toBe("broker");

    // The resident rates the same showing too — one per rater.
    const residentRated = await callId(ratingPOST, id, resident, { stars: 5 });
    expect(residentRated.status).toBe(201);
  });
});
