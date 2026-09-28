/**
 * TASK-010 — Security hardening, E2E, and concurrency tests (in-memory path).
 *
 * Covers the scope §7 MVP acceptance criteria end to end:
 *  - multi-role lifecycle: management seeds → resident availability →
 *    prospect request → resident accept → broker gate → confirm →
 *    check-in → complete → outcome, with the audit trail
 *  - authorization: wrong roles (403), cross-org access (404)
 *  - privacy: no resident contact information in prospect-facing payloads
 *  - double-booking: concurrent CONFIRM serializes on the unit lock (409),
 *    the lock releases on COMPLETE
 *  - idempotency: 5-way concurrent same-key create race → exactly one showing
 *  - rate limiting: unit behavior + 429 with Retry-After on /api/auth/login
 *  - input validation: malformed bodies fail closed with 400
 *  - reminder cron: stale CONFIRMED showings notified exactly once,
 *    CRON_SECRET enforced when configured
 *  - session cookie flags: HttpOnly + SameSite=Lax
 *
 * Skipped when DATABASE_URL is set — these tests pin the in-memory
 * fallback path. The Postgres mirror lives in
 * packages/db/test/showing-store.pg.test.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { POST as mfaVerifyPOST } from "../app/api/auth/mfa/verify/route";
import { POST as screeningRequestPOST } from "../app/api/screening/request/route";
import { currentMfaToken } from "@inssnapp/auth";
import { DEMO_TOTP_SECRET } from "../lib/demo";
import { POST as requestPOST } from "../app/api/showings/request/route";
import { POST as idRequestPOST } from "../app/api/showings/[id]/request/route";
import { POST as residentAcceptPOST } from "../app/api/showings/[id]/resident/accept/route";
import { POST as brokerAssignPOST } from "../app/api/showings/[id]/broker/assign/route";
import { POST as brokerAcceptPOST } from "../app/api/showings/[id]/broker/accept/route";
import { POST as confirmPOST } from "../app/api/showings/[id]/confirm/route";
import { POST as checkInPOST } from "../app/api/showings/[id]/check-in/route";
import { POST as completePOST } from "../app/api/showings/[id]/complete/route";
import { POST as outcomePOST } from "../app/api/showings/[id]/outcome/route";
import { POST as ratingPOST } from "../app/api/showings/[id]/rating/route";
import { POST as availabilityPOST } from "../app/api/residents/me/availability/route";
import { POST as unitsPOST } from "../app/api/units/route";
import { POST as consentPOST } from "../app/api/screening/consent/route";
import { POST as createShowingPOST } from "../app/api/showings/route";
import { GET as showingsGET } from "../app/api/showings/route";
import { GET as eventsGET } from "../app/api/events/route";
import { GET as remindersGET } from "../app/api/cron/reminders/route";
import { checkRateLimit, resetRateLimits } from "../lib/rate-limit";
import { store as memStore } from "../lib/store";
import { db } from "../lib/db";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

type IdHandler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<NextResponse>;
type CollectionHandler = (req: NextRequest) => Promise<NextResponse>;

async function loginAs(email: string, password = "pw"): Promise<string> {
  const { status, cookie } = await loginCookie(email, password);
  expect(status, `login as ${email}`).toBe(200);
  expect(cookie).toContain("=");
  return cookie;
}

async function loginCookie(email: string, password = "pw"): Promise<{ status: number; cookie: string; setCookie: string; res: NextResponse }> {
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const res = await loginPOST(req);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { status: res.status, cookie: setCookie.split(";")[0], setCookie, res };
}

function post(path: string, cookie: string | null, body: unknown) {
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
  handler: IdHandler,
  showingId: string,
  cookie: string | null,
  body: unknown = {},
): Promise<{ status: number; json: any }> {
  const { req } = post(`/api/showings/${showingId}/x`, cookie, body);
  const res = await handler(req, { params: Promise.resolve({ id: showingId }) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function callCollection(
  handler: CollectionHandler,
  path: string,
  cookie: string | null,
  body: unknown = {},
): Promise<{ status: number; json: any; res: NextResponse }> {
  const { req } = post(path, cookie, body);
  const res = await handler(req);
  return { status: res.status, json: await res.json().catch(() => null), res };
}

describeMem("TASK-010 hardening (in-memory path)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("rate limiter: allows within budget, blocks over it, isolates keys, resets per window", () => {
    const opts = { windowMs: 60_000, max: 3 };
    const t0 = 1_000_000;
    expect(checkRateLimit("k1", opts, t0).allowed).toBe(true);
    expect(checkRateLimit("k1", opts, t0 + 1).allowed).toBe(true);
    expect(checkRateLimit("k1", opts, t0 + 2).allowed).toBe(true);
    const blocked = checkRateLimit("k1", opts, t0 + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // A different key is unaffected.
    expect(checkRateLimit("k2", opts, t0 + 3).allowed).toBe(true);
    // After the window, the budget resets.
    expect(checkRateLimit("k1", opts, t0 + 60_001).allowed).toBe(true);
  });

  it("login is rate-limited: 429 with Retry-After after the budget is spent", async () => {
    process.env.INSSNAPP_RL_LOGIN_MAX = "2";
    try {
      const attempt = () =>
        loginCookie("ratelimit-t10@example.com", "wrong-password");
      const first = await attempt();
      expect(first.status).toBe(401);
      const second = await attempt();
      expect(second.status).toBe(401);
      const third = await attempt();
      expect(third.status).toBe(429);
      // Retry-After header is set so well-behaved clients back off.
      const retryAfter = third.res.headers.get("retry-after");
      expect(retryAfter).toBeTruthy();
      expect(parseInt(retryAfter ?? "0", 10)).toBeGreaterThan(0);
      expect(third.res.headers.get("content-type")).toContain("application/json");
    } finally {
      delete process.env.INSSNAPP_RL_LOGIN_MAX;
      resetRateLimits();
    }
  });

  it("screening requests are rate-limited per user: 429 after the budget is spent", async () => {
    process.env.INSSNAPP_RL_SCREENING_MAX = "2";
    try {
      // Privileged login (admin requires MFA).
      const loginReq = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@inssnapp.demo", password: "pw" }),
      });
      const loginRes = await loginPOST(loginReq);
      expect(loginRes.status).toBe(202);
      const { challengeId } = await loginRes.json();
      const verifyReq = new NextRequest("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code: currentMfaToken(DEMO_TOTP_SECRET) }),
      });
      const verifyRes = await mfaVerifyPOST(verifyReq);
      expect(verifyRes.status).toBe(200);
      const cookie = (verifyRes.headers.get("set-cookie") ?? "").split(";")[0];

      const call = () =>
        screeningRequestPOST(
          new NextRequest("http://localhost/api/screening/request", {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
            body: JSON.stringify({ prospectUserId: "u_prospect" }),
          }),
        );

      // The throttle fires before consent/adapter checks, so the first two
      // calls reach the business logic (409: no consent) and the third is 429.
      expect((await call()).status).not.toBe(429);
      expect((await call()).status).not.toBe(429);
      const third = await call();
      expect(third.status).toBe(429);
      expect(third.headers.get("retry-after")).toBeTruthy();
    } finally {
      delete process.env.INSSNAPP_RL_SCREENING_MAX;
      resetRateLimits();
    }
  });

  it("session cookie carries HttpOnly and SameSite=Lax", async () => {
    const { status, setCookie } = await loginCookie("manager@inssnapp.demo");
    expect(status).toBe(200);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=");
  });

  it("input validation fails closed with 400 on malformed bodies", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const manager = await loginAs("manager@inssnapp.demo");

    // Missing unitId.
    const noUnit = await callCollection(requestPOST, "/api/showings/request", prospect, {});
    expect(noUnit.status).toBe(400);

    // Unknown unit id.
    const badUnit = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_nope",
      idempotencyKey: "t10-val-1",
    });
    expect(badUnit.status).toBe(404);

    // Invalid outcome enum.
    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_2",
      idempotencyKey: "t10-val-2",
    });
    expect(created.status).toBe(201);
    const badOutcome = await call(outcomePOST, created.json.showing.id, prospect, {
      outcome: "MAYBE",
    });
    expect(badOutcome.status).toBe(400);

    // Unit label length bound.
    const badLabel = await callCollection(unitsPOST, "/api/units", manager, {
      propertyId: "prop_1",
      label: "",
    });
    expect(badLabel.status).toBe(400);

    // Consent free-text length cap (TASK-010).
    const longConsent = await callCollection(consentPOST, "/api/screening/consent", manager, {
      prospectUserId: "u_prospect",
      scopeText: "x".repeat(2001),
    });
    expect(longConsent.status).toBe(400);
    const okConsent = await callCollection(consentPOST, "/api/screening/consent", manager, {
      prospectUserId: "u_prospect",
      scopeText: "x".repeat(2000),
    });
    expect(okConsent.status).toBe(201);
  });

  it("5 concurrent creates with the same idempotency key produce exactly one showing", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const key = `t10-race-${Date.now()}`;

    const before = (await db.showings.list("org_1")).map((s: { id: string }) => s.id);

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        callCollection(requestPOST, "/api/showings/request", prospect, {
          unitId: "unit_1",
          idempotencyKey: key,
        }),
      ),
    );

    // Every concurrent caller gets a successful response for the SAME showing.
    for (const a of attempts) {
      expect([200, 201]).toContain(a.status);
    }
    const ids = new Set(attempts.map((a) => a.json.showing.id as string));
    expect(ids.size).toBe(1);

    // Exactly one audit event carries the key…
    const events = (await db.showingEvents.list("org_1")).filter(
      (e: { idempotencyKey: string }) => e.idempotencyKey === key,
    );
    expect(events).toHaveLength(1);
    expect(events[0].showingId).toBe([...ids][0]);

    // …and no orphan showings were left behind by the losers.
    const after = (await db.showings.list("org_1")).map((s: { id: string }) => s.id);
    const created = after.filter((id: string) => !before.includes(id));
    expect(created).toHaveLength(1);
    expect(created[0]).toBe([...ids][0]);
  });

  it("full multi-role lifecycle E2E: seed → available → request → accept → broker gate → confirm → check-in → complete → outcome", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    const resident = await loginAs("resident@inssnapp.demo");
    const prospect = await loginAs("prospect@inssnapp.demo");
    const broker = await loginAs("broker@inssnapp.demo");
    const manager2 = await loginAs("manager2@inssnapp.demo");

    // §7: a management-authorized unit can become eligible for resident participation.
    const unit = await callCollection(unitsPOST, "/api/units", manager, {
      propertyId: "prop_1",
      label: "T10-E2E",
      eligible: true,
    });
    expect(unit.status).toBe(201);
    expect(unit.json.unit.eligible).toBe(true);

    // §7: resident turns availability OFF → the unit is not requestable…
    const off = await callCollection(availabilityPOST, "/api/residents/me/availability", resident, {
      unitId: "unit_1",
      available: false,
    });
    expect(off.status).toBe(200);
    expect(off.json.unit.residentAvailable).toBe(false);
    const refused = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_1",
      idempotencyKey: "t10-e2e-refused",
    });
    expect(refused.status).toBe(400);

    // …and back ON → a valid request flows.
    const on = await callCollection(availabilityPOST, "/api/residents/me/availability", resident, {
      unitId: "unit_1",
      available: true,
    });
    expect(on.json.unit.residentAvailable).toBe(true);

    // §7: prospect requests an available unit and sees real-time status changes.
    const created = await callCollection(requestPOST, "/api/showings/request", prospect, {
      unitId: "unit_1",
      idempotencyKey: "t10-e2e-req",
    });
    expect(created.status).toBe(201);
    expect(created.json.showing.state).toBe("REQUESTED");
    const id = created.json.showing.id as string;

    // §5 privacy: prospect-facing payloads carry no resident contact info.
    expect(JSON.stringify(created.json)).not.toContain("@inssnapp.demo");

    const poll = await showingsGET(
      new NextRequest("http://localhost/api/showings", { headers: { cookie: prospect } }),
    );
    expect(poll.status).toBe(200);
    const mine = ((await poll.json()) as { showings: any[] }).showings.find((s) => s.id === id);
    expect(mine?.state).toBe("REQUESTED");
    expect(JSON.stringify(mine)).not.toContain("@inssnapp.demo");

    // §7: resident accepts; broker gate inserts without breaking the workflow.
    const accepted = await call(residentAcceptPOST, id, resident, { idempotencyKey: "t10-e2e-accept" });
    expect(accepted.status).toBe(200);
    expect(accepted.json.showing.state).toBe("RESIDENT_ACCEPTED");

    const assigned = await call(brokerAssignPOST, id, manager, {
      brokerUserId: "u_broker",
      idempotencyKey: "t10-e2e-assign",
    });
    expect(assigned.status).toBe(200);
    expect(assigned.json.showing.state).toBe("BROKER_GATE");
    expect(assigned.json.showing.brokerUserId).toBe("u_broker");

    const brokerAccepted = await call(brokerAcceptPOST, id, broker, { idempotencyKey: "t10-e2e-baccept" });
    expect(brokerAccepted.status).toBe(200);
    expect(brokerAccepted.json.showing.state).toBe("CONFIRMED");

    // §7/§5: double-booking protection — a second workflow on the same unit
    // cannot CONFIRM while the first holds the unit lock.
    const second = await callCollection(createShowingPOST, "/api/showings", manager, {
      unitId: "unit_1",
      residentUserId: "u_resident",
    });
    expect(second.status).toBe(201);
    const secondId = second.json.showing.id as string;
    const secondReq = await call(idRequestPOST, secondId, prospect, { idempotencyKey: "t10-e2e-req2" });
    expect(secondReq.status).toBe(200);
    expect(secondReq.json.showing.state).toBe("REQUESTED");
    const secondAccept = await call(residentAcceptPOST, secondId, resident, { idempotencyKey: "t10-e2e-accept2" });
    expect(secondAccept.json.showing.state).toBe("RESIDENT_ACCEPTED");
    const locked = await call(confirmPOST, secondId, manager, { idempotencyKey: "t10-e2e-confirm2" });
    expect(locked.status).toBe(409);
    expect(locked.json.code).toBe("UNIT_LOCKED");

    // §7: confirmed showing checks in, completes, and releases the lock.
    const checkedIn = await call(checkInPOST, id, broker, { idempotencyKey: "t10-e2e-checkin" });
    expect(checkedIn.json.showing.state).toBe("IN_PROGRESS");
    const completed = await call(completePOST, id, broker, { idempotencyKey: "t10-e2e-complete" });
    expect(completed.json.showing.state).toBe("COMPLETED");

    // The released lock lets the second workflow confirm now.
    const confirm2 = await call(confirmPOST, secondId, manager, { idempotencyKey: "t10-e2e-confirm2b" });
    expect(confirm2.status).toBe(200);
    expect(confirm2.json.showing.state).toBe("CONFIRMED");

    // Rating validation + happy path on the completed showing.
    const badStars = await call(ratingPOST, id, broker, { stars: 7 });
    expect(badStars.status).toBe(400);
    const rated = await call(ratingPOST, id, broker, { stars: 5, comment: "Smooth." });
    expect(rated.status).toBe(201);

    // §7: prospect records Apply after completion.
    const outcome = await call(outcomePOST, id, prospect, { outcome: "APPLY" });
    expect(outcome.status).toBe(200);
    expect(outcome.json.showing.state).toBe("OUTCOME");
    expect(outcome.json.showing.outcome).toBe("APPLY");

    // §7: Control Center observes the workflow and the full audit trail.
    const eventsRes = await eventsGET(
      new NextRequest("http://localhost/api/events", { headers: { cookie: manager } }),
    );
    expect(eventsRes.status).toBe(200);
    const trail = ((await eventsRes.json()) as { events: any[] }).events.filter(
      (e) => e.showingId === id,
    );
    expect(trail.map((e) => e.transition).sort()).toEqual(
      ["BROKER_ACCEPT", "BROKER_ASSIGN", "CHECK_IN", "COMPLETE", "PROSPECT_REQUEST", "RECORD_OUTCOME", "RESIDENT_ACCEPT"].sort(),
    );
    for (const e of trail) {
      expect(e.organizationId).toBe("org_1");
      expect(e.actorUserId).toBeTruthy();
      expect(e.fromState).not.toBe(e.toState);
      expect(e.at).toBeTruthy();
    }

    // §7: unauthorized roles cannot mutate; cross-org users get 404 (not 403 —
    // records cannot be probed).
    const prospectConfirm = await call(confirmPOST, secondId, prospect, {});
    expect(prospectConfirm.status).toBe(403);
    const crossOrg = await call(confirmPOST, id, manager2, {});
    expect(crossOrg.status).toBe(404);
    const crossOrgList = await showingsGET(
      new NextRequest("http://localhost/api/showings", { headers: { cookie: manager2 } }),
    );
    const otherShowings = ((await crossOrgList.json()) as { showings: any[] }).showings;
    expect(otherShowings.every((s) => s.organizationId === "org_2")).toBe(true);
    expect(otherShowings.some((s) => s.id === id)).toBe(false);

    // Stash the second (CONFIRMED) showing id for the reminder-cron test.
    (globalThis as any).__t10_reminderShowingId = secondId;
  });

  it("reminder cron notifies stale CONFIRMED showings exactly once", async () => {
    const secondId = (globalThis as any).__t10_reminderShowingId as string;
    expect(secondId).toBeTruthy();

    // Age the CONFIRMED showing past the 24h reminder threshold.
    const current = memStore.showings.get(secondId);
    expect(current?.state).toBe("CONFIRMED");
    memStore.showings.set(secondId, {
      ...current!,
      updatedAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
    });

    const run = await remindersGET(new NextRequest("http://localhost/api/cron/reminders"));
    expect(run.status).toBe(200);
    const first = (await run.json()) as { ok: boolean; candidates: number; sent: number };
    expect(first.sent).toBe(1);
    expect(await db.reminders.sent(secondId)).toBe(true);

    // Second run: already reminded → no duplicate notification.
    const run2 = await remindersGET(new NextRequest("http://localhost/api/cron/reminders"));
    const again = (await run2.json()) as { candidates: number; sent: number };
    expect(again.candidates).toBe(0);
    expect(again.sent).toBe(0);
  });

  it("reminder cron enforces CRON_SECRET when configured", async () => {
    process.env.CRON_SECRET = "t10-test-secret";
    try {
      const noAuth = await remindersGET(new NextRequest("http://localhost/api/cron/reminders"));
      expect(noAuth.status).toBe(401);
      const wrong = await remindersGET(
        new NextRequest("http://localhost/api/cron/reminders", {
          headers: { authorization: "Bearer wrong" },
        }),
      );
      expect(wrong.status).toBe(401);
      const right = await remindersGET(
        new NextRequest("http://localhost/api/cron/reminders", {
          headers: { authorization: "Bearer t10-test-secret" },
        }),
      );
      expect(right.status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
