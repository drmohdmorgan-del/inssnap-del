/**
 * TASK-007 — API route tests for the Management desktop and Control Center.
 *
 * Drives the new management and control routes through their real Next.js
 * route handlers on the in-memory store path: portfolio CRUD, unit
 * eligibility toggle, residents, reports, truthful integrations, admin-only
 * control endpoints, and security-event recording in the auth routes.
 *
 * Skipped when DATABASE_URL is set — these tests pin the in-memory
 * fallback path. Run with no DATABASE_URL in the environment.
 */

import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { currentMfaToken } from "@inssnapp/auth";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { POST as mfaVerifyPOST } from "../app/api/auth/mfa/verify/route";
import {
  GET as propertiesGET,
  POST as propertiesPOST,
} from "../app/api/properties/route";
import {
  PATCH as propertyPATCH,
  DELETE as propertyDELETE,
} from "../app/api/properties/[id]/route";
import { GET as unitsGET, POST as unitsPOST } from "../app/api/units/route";
import { PATCH as unitPATCH, DELETE as unitDELETE } from "../app/api/units/[id]/route";
import { GET as residentsGET } from "../app/api/residents/route";
import { GET as reportsGET } from "../app/api/reports/route";
import { GET as integrationsGET } from "../app/api/integrations/route";
import { POST as showingsPOST } from "../app/api/showings/route";
import { POST as requestPOST } from "../app/api/showings/request/route";
import { GET as controlOrgsGET } from "../app/api/control/orgs/route";
import { GET as controlWorkflowGET } from "../app/api/control/workflow/route";
import { GET as controlEventsGET } from "../app/api/control/events/route";
import { GET as controlSecurityGET } from "../app/api/control/security-events/route";
import { DEMO_TOTP_SECRET } from "../lib/demo";

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

async function loginAsAdmin(): Promise<string> {
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@inssnapp.demo", password: "pw" }),
  });
  const res = await loginPOST(req);
  expect(res.status, "admin login step 1").toBe(202);
  const { challengeId } = await res.json();
  const vreq = new NextRequest("http://localhost/api/auth/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, code: currentMfaToken(DEMO_TOTP_SECRET) }),
  });
  const vres = await mfaVerifyPOST(vreq);
  expect(vres.status, "admin mfa verify").toBe(200);
  return (vres.headers.get("set-cookie") ?? "").split(";")[0];
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

describeMem("TASK-007 management + control routes (in-memory path)", () => {
  it("requires authentication on every new route", async () => {
    const unauth: [CollectionHandler, string][] = [
      [propertiesPOST, "/api/properties"],
      [unitsPOST, "/api/units"],
      [residentsGET, "/api/residents"],
      [reportsGET, "/api/reports"],
      [integrationsGET, "/api/integrations"],
      [controlOrgsGET, "/api/control/orgs"],
      [controlWorkflowGET, "/api/control/workflow"],
      [controlEventsGET, "/api/control/events"],
      [controlSecurityGET, "/api/control/security-events"],
    ];
    for (const [handler, path] of unauth) {
      const { status } = await callCollection(handler, path, null, "POST", {});
      expect(status, `${path} unauthenticated`).toBe(401);
    }
    const { status } = await callItem(unitPATCH, "/api/units/unit_1", "unit_1", null, "PATCH", {});
    expect(status, "unit PATCH unauthenticated").toBe(401);
  });

  it("forbids non-privileged roles on management routes", async () => {
    const resident = await loginAs("resident@inssnapp.demo");
    const { status: s1 } = await callCollection(propertiesPOST, "/api/properties", resident, "POST", {
      name: "X",
      address: "Y",
    });
    expect(s1).toBe(403);
    const { status: s2 } = await callItem(unitPATCH, "/api/units/unit_1", "unit_1", resident, "PATCH", {
      eligible: false,
    });
    expect(s2).toBe(403);
    const { status: s3 } = await callCollection(reportsGET, "/api/reports", resident);
    expect(s3).toBe(403);
    const { status: s4 } = await callCollection(integrationsGET, "/api/integrations", resident);
    expect(s4).toBe(403);
  });

  it("restricts the Control Center API to inssnapp_admin", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    for (const [handler, path] of [
      [controlOrgsGET, "/api/control/orgs"],
      [controlWorkflowGET, "/api/control/workflow"],
      [controlEventsGET, "/api/control/events"],
      [controlSecurityGET, "/api/control/security-events"],
    ] as [CollectionHandler, string][]) {
      const { status } = await callCollection(handler, path, manager);
      expect(status, `${path} for management`).toBe(403);
    }
  });

  it("runs property CRUD with org isolation", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    const manager2 = await loginAs("manager2@inssnapp.demo");

    const created = await callCollection(propertiesPOST, "/api/properties", manager, "POST", {
      name: "Test Towers",
      address: "1 Test Way",
    });
    expect(created.status).toBe(201);
    const propId = created.json.property.id as string;

    const listed = await callCollection(propertiesGET, "/api/properties", manager);
    expect(listed.json.properties.map((p: any) => p.id)).toContain(propId);

    const bad = await callCollection(propertiesPOST, "/api/properties", manager, "POST", {
      name: "",
      address: "nowhere",
    });
    expect(bad.status).toBe(400);

    // Cross-org patch: manager2 (org_2) must not see the org_1 property.
    const cross = await callItem(
      propertyPATCH,
      `/api/properties/${propId}`,
      propId,
      manager2,
      "PATCH",
      { name: "Hijacked" },
    );
    expect(cross.status).toBe(404);

    const patched = await callItem(
      propertyPATCH,
      `/api/properties/${propId}`,
      propId,
      manager,
      "PATCH",
      { name: "Test Towers Renamed" },
    );
    expect(patched.status).toBe(200);
    expect(patched.json.property.name).toBe("Test Towers Renamed");

    const deleted = await callItem(
      propertyDELETE,
      `/api/properties/${propId}`,
      propId,
      manager,
      "DELETE",
    );
    expect(deleted.status).toBe(200);
    const listedAfter = await callCollection(propertiesGET, "/api/properties", manager);
    expect(listedAfter.json.properties.map((p: any) => p.id)).not.toContain(propId);
  });

  it("toggles unit eligibility and isolates units cross-org", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    const manager2 = await loginAs("manager2@inssnapp.demo");

    // Create a throwaway unit under the seed property prop_1.
    const created = await callCollection(unitsPOST, "/api/units", manager, "POST", {
      propertyId: "prop_1",
      label: "T7",
    });
    expect(created.status).toBe(201);
    const unitId = created.json.unit.id as string;
    expect(created.json.unit.eligible).toBe(true);

    // Eligibility toggle off.
    const toggled = await callItem(unitPATCH, `/api/units/${unitId}`, unitId, manager, "PATCH", {
      eligible: false,
    });
    expect(toggled.status).toBe(200);
    expect(toggled.json.unit.eligible).toBe(false);

    // Cross-org toggle is a 404.
    const cross = await callItem(
      unitPATCH,
      `/api/units/${unitId}`,
      unitId,
      manager2,
      "PATCH",
      { eligible: true },
    );
    expect(cross.status).toBe(404);

    // Seed unit_1 (org_1) is invisible to manager2 (org_2).
    const seedCross = await callItem(
      unitPATCH,
      "/api/units/unit_1",
      "unit_1",
      manager2,
      "PATCH",
      { eligible: false },
    );
    expect(seedCross.status).toBe(404);

    // Toggle back on, then clean up.
    await callItem(unitPATCH, `/api/units/${unitId}`, unitId, manager, "PATCH", {
      eligible: true,
    });
    const deleted = await callItem(unitDELETE, `/api/units/${unitId}`, unitId, manager, "DELETE");
    expect(deleted.status).toBe(200);
  });

  it("rejects unit creation under another org's property", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    const { status } = await callCollection(unitsPOST, "/api/units", manager, "POST", {
      propertyId: "prop_3", // org_2's property
      label: "ZZ",
    });
    expect(status).toBe(404);
  });

  it("lists enrolled residents with participation status", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    const { status, json } = await callCollection(residentsGET, "/api/residents", manager);
    expect(status).toBe(200);
    const jordan = json.residents.find((r: any) => r.email === "resident@inssnapp.demo");
    expect(jordan).toBeDefined();
    expect(jordan.participation).toBe("available_now");
    expect(jordan.unitLabel).toBeDefined();
  });

  it("reports funnel counts, response times, and participation", async () => {
    const manager = await loginAs("manager@inssnapp.demo");

    const before = await callCollection(reportsGET, "/api/reports", manager);
    expect(before.status).toBe(200);
    expect(before.json.participation.residentAccounts).toBe(1);
    expect(before.json.participation.enrolled).toBe(1);
    expect(before.json.participation.availableNow).toBe(2);

    // Create a showing so the funnel has data.
    const created = await callCollection(showingsPOST, "/api/showings", manager, "POST", {
      unitId: "unit_1",
      residentUserId: "u_resident",
    });
    expect(created.status).toBe(201);

    const after = await callCollection(reportsGET, "/api/reports", manager);
    expect(after.json.funnel.AVAILABLE).toBe((before.json.funnel.AVAILABLE ?? 0) + 1);
    expect(after.json.totals.showings).toBe(before.json.totals.showings + 1);
    expect(after.json.response).toHaveProperty("responded");
    expect(after.json.response).toHaveProperty("pending");
  });

  it("reports integration status truthfully — no hardcoded connected badges", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    const { status, json } = await callCollection(integrationsGET, "/api/integrations", manager);
    expect(status).toBe(200);
    const yardi = json.integrations.find((i: any) => i.name === "Yardi PMS");
    expect(yardi).toBeDefined();
    expect(yardi.status).toBe("sandbox");
    const notifications = json.integrations.find((i: any) => i.name === "Notifications");
    expect(notifications).toBeDefined();
    expect(notifications.status).toBe("not_configured");
    expect(
      json.integrations.every((i: any) => i.status !== "connected"),
      "nothing may claim to be connected without an adapter",
    ).toBe(true);
  });

  it("serves the organization overview and workflow monitor to admins", async () => {
    const admin = await loginAsAdmin();

    const orgs = await callCollection(controlOrgsGET, "/api/control/orgs", admin);
    expect(orgs.status).toBe(200);
    expect(orgs.json.orgs).toHaveLength(2);
    const skyline = orgs.json.orgs.find((o: any) => o.name === "Skyline Residential Group");
    expect(skyline.counts.users).toBeGreaterThan(0);
    expect(skyline.counts.units).toBeGreaterThan(0);

    const workflow = await callCollection(controlWorkflowGET, "/api/control/workflow", admin);
    expect(workflow.status).toBe(200);
    expect(workflow.json.orgs).toHaveLength(2);
    expect(workflow.json.totals).toHaveProperty("totalShowings");
    expect(workflow.json.totals).toHaveProperty("byState");
  });

  it("filters the cross-org audit log", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const admin = await loginAsAdmin();

    // Generate a REQUEST transition on unit_2.
    const created = await callCollection(requestPOST, "/api/showings/request", prospect, "POST", {
      unitId: "unit_2",
      idempotencyKey: "task007-audit-1",
    });
    expect(created.status).toBe(201);

    const filtered = await callCollection(
      controlEventsGET,
      "/api/control/events?transition=PROSPECT_REQUEST&limit=50",
      admin,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.json.events.length).toBeGreaterThan(0);
    expect(
      filtered.json.events.every((e: any) => e.transition === "PROSPECT_REQUEST"),
    ).toBe(true);
  });

  it("records security events on failed logins and exposes them to admins", async () => {
    const admin = await loginAsAdmin();

    // Wrong password for a known account.
    const bad = await loginAs("manager@inssnapp.demo", "wrong").catch(() => null);
    expect(bad).toBeNull();
    // Unknown email entirely.
    await loginAs("nobody@inssnapp.demo", "pw").catch(() => null);

    const { status, json } = await callCollection(
      controlSecurityGET,
      "/api/control/security-events?type=login_failed&limit=50",
      admin,
    );
    expect(status).toBe(200);
    const wrongPw = json.events.find(
      (e: any) => e.actorEmail === "manager@inssnapp.demo" && e.detail === "incorrect password",
    );
    expect(wrongPw).toBeDefined();
    const unknown = json.events.find(
      (e: any) => e.actorEmail === "nobody@inssnapp.demo" && e.detail === "unknown email",
    );
    expect(unknown).toBeDefined();
  });

  it("records successful logins as security events", async () => {
    const manager = await loginAs("manager@inssnapp.demo");
    expect(manager).toBeTruthy();
    const admin = await loginAsAdmin();
    const { status, json } = await callCollection(
      controlSecurityGET,
      "/api/control/security-events?type=login_succeeded&limit=50",
      admin,
    );
    expect(status).toBe(200);
    const entry = json.events.find((e: any) => e.actorEmail === "manager@inssnapp.demo");
    expect(entry).toBeDefined();
  });
});
