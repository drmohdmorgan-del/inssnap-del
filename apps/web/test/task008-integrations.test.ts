/**
 * TASK-008 — PMS sandbox sync + notification hook API tests.
 *
 * Drives the real Next.js route handlers on the in-memory store path:
 *   - POST /api/integrations/sync (sandbox PMS sync: health → idempotent
 *     fetch→apply → bookkeeping), including org-scoping and idempotency.
 *   - GET /api/integrations reflects real adapter state (adapter type,
 *     last sync, last health check) — no hardcoded badges.
 *   - Notification hooks: showing transitions fire events through the
 *     NotificationAdapter interface, and a throwing provider never breaks
 *     the transition.
 *   - End-to-end: synced units flow through the real showing lifecycle
 *     (resident availability → prospect request → accept → confirm →
 *     complete) on PMS-synced data.
 *
 * Skipped when DATABASE_URL is set — these tests pin the in-memory
 * fallback path. Run with no DATABASE_URL in the environment.
 */

import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  setNotificationAdapter,
  resetNotificationAdapter,
  type NotificationAdapter,
  type NotificationPayload,
} from "@inssnapp/integrations";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { GET as integrationsGET } from "../app/api/integrations/route";
import { POST as syncPOST } from "../app/api/integrations/sync/route";
import { GET as unitsGET } from "../app/api/units/route";
import { GET as residentsGET } from "../app/api/residents/route";
import { POST as requestPOST } from "../app/api/showings/request/route";
import { POST as acceptPOST } from "../app/api/showings/[id]/resident/accept/route";
import { POST as confirmPOST } from "../app/api/showings/[id]/confirm/route";
import { POST as checkInPOST } from "../app/api/showings/[id]/check-in/route";
import { POST as completePOST } from "../app/api/showings/[id]/complete/route";
import { POST as availabilityPOST } from "../app/api/residents/me/availability/route";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

type CollectionHandler = (req: NextRequest) => Promise<NextResponse>;
type ItemHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

async function loginAs(email: string, password = "pw"): Promise<string> {
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const res = await loginPOST(req);
  expect(res.status, `login as ${email}`).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("=");
  return setCookie.split(";")[0];
}

function reqWithCookie(
  path: string,
  cookie: string | null,
  method: string,
  body?: unknown,
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callCollection(
  handler: CollectionHandler,
  path: string,
  cookie: string | null,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await handler(reqWithCookie(path, cookie, method, body));
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function callItem(
  handler: ItemHandler,
  path: string,
  id: string,
  cookie: string | null,
  method: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await handler(reqWithCookie(path, cookie, method, body), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

describeMem("TASK-008 PMS sandbox sync + notifications (in-memory path)", () => {
  it("requires auth and privilege on the sync route", async () => {
    const anon = await callCollection(syncPOST, "/api/integrations/sync", null, "POST", {});
    expect(anon.status).toBe(401);
    const prospect = await loginAs("prospect@inssnapp.demo");
    const forbiddenRes = await callCollection(syncPOST, "/api/integrations/sync", prospect, "POST", {});
    expect(forbiddenRes.status).toBe(403);
  });

  it("org_2 (no adapter) reports honestly and cannot sync", async () => {
    const mgr2 = await loginAs("manager2@inssnapp.demo");
    const { json } = await callCollection(integrationsGET, "/api/integrations", mgr2);
    const pms = json.integrations.find((i: any) => i.name === "PMS");
    expect(pms.status).toBe("not_connected");

    const { status, json: syncJson } = await callCollection(
      syncPOST, "/api/integrations/sync", mgr2, "POST", {},
    );
    expect(status).toBe(404);
    expect(syncJson.error).toMatch(/No implemented PMS adapter/);
  });

  it("org_1 reports the sandbox adapter honestly before any sync", async () => {
    const mgr = await loginAs("manager@inssnapp.demo");
    const { json } = await callCollection(integrationsGET, "/api/integrations", mgr);
    const pms = json.integrations.find((i: any) => i.name === "Yardi PMS");
    expect(pms).toBeDefined();
    expect(pms.status).toBe("sandbox");
    expect(pms.adapterType).toBe("sandbox");
    expect(pms.lastSyncAt).toBeNull();
    expect(pms.lastHealthCheckAt).toBeNull();

    const notifications = json.integrations.find((i: any) => i.name === "Notifications");
    // Dev default is the console logger: honestly "sandbox", never "connected".
    expect(notifications.status).toBe("sandbox");
    expect(notifications.detail).toMatch(/ConsoleNotificationAdapter/);
  });

  it("syncs the sandbox dataset: properties, units, resident roster", async () => {
    const mgr = await loginAs("manager@inssnapp.demo");
    const { status, json } = await callCollection(
      syncPOST, "/api/integrations/sync", mgr, "POST", {},
    );
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.sync.adapterType).toBe("sandbox");
    expect(json.sync.properties).toEqual({ created: 2, updated: 0 });
    expect(json.sync.units).toEqual({ created: 3, updated: 0 });
    expect(json.sync.residents.linked).toBe(1);
    expect(json.sync.residents.skippedNoUser).toBe(1);
    expect(json.sync.errors).toEqual([]);

    // Synced units are real portfolio data now, tagged with vendor ids.
    const { json: unitsJson } = await callCollection(unitsGET, "/api/units", mgr);
    const synced = unitsJson.units.filter((u: any) => u.pmsExternalId === "YRD-U-90011");
    expect(synced).toHaveLength(1);
    expect(synced[0].eligible).toBe(true);
    expect(synced[0].label).toBe("1A");
  });

  it("re-sync is idempotent: no duplicates, updates counted as updates", async () => {
    const mgr = await loginAs("manager@inssnapp.demo");
    const before = await callCollection(unitsGET, "/api/units", mgr);
    const countBefore = before.json.units.length;

    const { status, json } = await callCollection(
      syncPOST, "/api/integrations/sync", mgr, "POST", {},
    );
    expect(status).toBe(200);
    expect(json.sync.properties).toEqual({ created: 0, updated: 2 });
    expect(json.sync.units).toEqual({ created: 0, updated: 3 });
    expect(json.sync.residents.linked).toBe(0);

    const after = await callCollection(unitsGET, "/api/units", mgr);
    expect(after.json.units.length).toBe(countBefore);
  });

  it("integrations status reflects the real sync + health check", async () => {
    const mgr = await loginAs("manager@inssnapp.demo");
    const { json } = await callCollection(integrationsGET, "/api/integrations", mgr);
    const pms = json.integrations.find((i: any) => i.name === "Yardi PMS");
    expect(pms.status).toBe("sandbox");
    expect(pms.lastSyncAt).not.toBeNull();
    expect(pms.lastHealthCheckAt).not.toBeNull();
    expect(pms.healthStatus).toBe("ok");
    expect(pms.detail).toMatch(/Last sync/);
  });

  it("the resident roster links the demo resident to the synced unit", async () => {
    const mgr = await loginAs("manager@inssnapp.demo");
    const { json } = await callCollection(residentsGET, "/api/residents", mgr);
    const link = json.residents.find(
      (r: any) => r.email === "resident@inssnapp.demo" && r.unitLabel === "1A",
    );
    expect(link).toBeDefined();
    expect(link.propertyName).toBe("Cedar Grove");
  });

  it("showing lifecycle works end-to-end on PMS-synced data", async () => {
    const mgr = await loginAs("manager@inssnapp.demo");
    const { json: unitsJson } = await callCollection(unitsGET, "/api/units", mgr);
    const unit = unitsJson.units.find((u: any) => u.pmsExternalId === "YRD-U-90011");
    expect(unit).toBeDefined();

    // Capture notifications instead of just logging them.
    const seen: NotificationPayload[] = [];
    const capturing: NotificationAdapter = {
      name: "test-capture",
      notify: async (p) => {
        seen.push(p);
        return { ok: true };
      },
    };
    setNotificationAdapter(capturing);
    try {
      // Resident flips "Available NOW" on the synced unit.
      const resident = await loginAs("resident@inssnapp.demo");
      const avail = await callCollection(
        availabilityPOST, "/api/residents/me/availability", resident, "POST",
        { unitId: unit.id, available: true },
      );
      expect(avail.status).toBe(200);

      // Prospect requests the synced unit.
      const prospect = await loginAs("prospect@inssnapp.demo");
      const req = await callCollection(
        requestPOST, "/api/showings/request", prospect, "POST", { unitId: unit.id },
      );
      expect(req.status, JSON.stringify(req.json)).toBe(201);
      const showingId = req.json.showing.id;
      expect(seen.map((p) => p.event)).toContain("showing.request_received");
      const received = seen.find((p) => p.event === "showing.request_received")!;
      expect(received.recipients.map((r) => r.role)).toContain("resident");
      expect(received.organizationId).toBe("org_1");

      // Resident accepts → "accepted" fires to the prospect.
      const acc = await callItem(acceptPOST, `/api/showings/${showingId}/resident/accept`, showingId, resident, "POST", {});
      expect(acc.status).toBe(200);
      expect(seen.map((p) => p.event)).toContain("showing.accepted");

      // Management confirms → "confirmed" fires.
      const conf = await callItem(confirmPOST, `/api/showings/${showingId}/confirm`, showingId, mgr, "POST", {});
      expect(conf.status).toBe(200);
      expect(seen.map((p) => p.event)).toContain("showing.confirmed");

      // Resident checks in (CONFIRMED → IN_PROGRESS), then completes → "completed" fires.
      const checkIn = await callItem(checkInPOST, `/api/showings/${showingId}/check-in`, showingId, resident, "POST", {});
      expect(checkIn.status).toBe(200);
      const comp = await callItem(completePOST, `/api/showings/${showingId}/complete`, showingId, resident, "POST", {});
      expect(comp.status).toBe(200);
      expect(seen.map((p) => p.event)).toContain("showing.completed");
    } finally {
      resetNotificationAdapter();
    }
  });

  it("a throwing notifier never breaks a transition (fail-open)", async () => {
    const throwing: NotificationAdapter = {
      name: "broken",
      notify: async () => {
        throw new Error("provider is down");
      },
    };
    setNotificationAdapter(throwing);
    try {
      const mgr = await loginAs("manager@inssnapp.demo");
      const { json: unitsJson } = await callCollection(unitsGET, "/api/units", mgr);
      // Second synced unit: fresh showing flow, no cross-test interference.
      const unit = unitsJson.units.find((u: any) => u.pmsExternalId === "YRD-U-90012");
      expect(unit).toBeDefined();

      const prospect = await loginAs("prospect@inssnapp.demo");
      const resident = await loginAs("resident@inssnapp.demo");

      const avail = await callCollection(
        availabilityPOST, "/api/residents/me/availability", resident, "POST",
        { unitId: unit.id, available: true },
      );
      // YRD-U-90012's roster row targets a nonexistent user, so the demo
      // resident has no link to it — the toggle is refused and the request
      // path proves its guard instead. Assert the guard holds honestly.
      expect(avail.status).toBe(404);

      // Use the already-linked synced unit instead; the provider is still
      // throwing, so accept must succeed anyway.
      const unitA = unitsJson.units.find((u: any) => u.pmsExternalId === "YRD-U-90011");
      const req = await callCollection(
        requestPOST, "/api/showings/request", prospect, "POST", { unitId: unitA.id },
      );
      expect(req.status, JSON.stringify(req.json)).toBe(201);
      const acc = await callItem(
        acceptPOST, `/api/showings/${req.json.showing.id}/resident/accept`,
        req.json.showing.id, resident, "POST", {},
      );
      expect(acc.status).toBe(200);
    } finally {
      resetNotificationAdapter();
    }
  });
});
