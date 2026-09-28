/**
 * TASK-009 — Checkr sandbox workflow API tests.
 *
 * Drives the real Next.js route handlers on the in-memory store path:
 *   - GET /api/screening (mode banner, recent screenings, consent records,
 *     production prerequisites) — privileged roles only
 *   - POST /api/screening/consent (prospect self-consent + staff-recorded
 *     consent, org-scoped) and its GET
 *   - POST /api/screening/request — consent fail-closed (409), deterministic
 *     sandbox fixtures, invalid fixture (400), RBAC, org-scoping
 *   - Production gate: configured-for-production still resolves to sandbox
 *     without a recorded legal approval
 *   - GET /api/integrations reports real screening mode (no hardcoded badge)
 *
 * Skipped when DATABASE_URL is set — these tests pin the in-memory
 * fallback path. Run with no DATABASE_URL in the environment.
 */

import { describe, expect, it, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { currentMfaToken } from "@inssnapp/auth";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { POST as mfaVerifyPOST } from "../app/api/auth/mfa/verify/route";
import { GET as screeningGET } from "../app/api/screening/route";
import {
  POST as consentPOST,
  GET as consentGET,
} from "../app/api/screening/consent/route";
import { POST as requestPOST } from "../app/api/screening/request/route";
import { GET as integrationsGET } from "../app/api/integrations/route";
import { DEMO_TOTP_SECRET } from "../lib/demo";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

type CollectionHandler = (req: NextRequest) => Promise<NextResponse>;

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
  cookie: string,
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
  cookie: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await handler(reqWithCookie(path, cookie, method, body));
  return { status: res.status, json: await res.json().catch(() => null) };
}

describeMem("screening status (Control Center data)", () => {
  afterEach(() => {
    delete process.env.SCREENING_MODE;
    delete process.env.SCREENING_PRODUCTION_ENABLED;
  });

  it("reports sandbox mode with prerequisites to privileged roles", async () => {
    const cookie = await loginAsAdmin();
    const { status, json } = await callCollection(screeningGET, "/api/screening", cookie);
    expect(status).toBe(200);
    expect(json.mode).toBe("sandbox");
    expect(json.adapter).toBe("checkr-sandbox");
    expect(json.sandbox).toBe(true);
    expect(json.productionBlockedReason).toBeNull();
    expect(json.productionPrerequisites).toContain(
      "Legal/compliance review approved and recorded",
    );
    expect(json.legalApproval).toBeNull();
    expect(Array.isArray(json.recentScreenings)).toBe(true);
    expect(Array.isArray(json.consentRecords)).toBe(true);
  });

  it("refuses non-privileged roles and unauthenticated callers", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    expect((await callCollection(screeningGET, "/api/screening", prospect)).status).toBe(403);
    expect((await callCollection(screeningGET, "/api/screening", "")).status).toBe(401);
  });

  it("stays in sandbox when configured for production without a legal approval", async () => {
    process.env.SCREENING_MODE = "production";
    process.env.SCREENING_PRODUCTION_ENABLED = "1";
    const cookie = await loginAsAdmin();
    const { status, json } = await callCollection(screeningGET, "/api/screening", cookie);
    expect(status).toBe(200);
    // The gate holds: no recorded legal approval → sandbox, with a reason.
    expect(json.mode).toBe("sandbox");
    expect(json.productionBlockedReason).toContain("no recorded legal-approval record");
  });
});

describeMem("consent flow", () => {
  it("a prospect can record their own consent", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const { status, json } = await callCollection(
      consentPOST,
      "/api/screening/consent",
      prospect,
      "POST",
      { prospectUserId: "u_prospect" },
    );
    expect(status).toBe(201);
    expect(json.consent.prospectUserId).toBe("u_prospect");
    expect(json.consent.organizationId).toBe("org_1");
    expect(json.consent.recordedBy).toBe("u_prospect");
    expect(json.consent.scopeText).toContain("SANDBOX");
    expect(json.consent.consentedAt).toBeTruthy();
  });

  it("a prospect cannot record consent for another user", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const { status } = await callCollection(
      consentPOST,
      "/api/screening/consent",
      prospect,
      "POST",
      { prospectUserId: "u_broker" },
    );
    expect(status).toBe(403);
  });

  it("management can record consent for a prospect in their org; cross-org is 404", async () => {
    const mgmt = await loginAs("manager@inssnapp.demo");
    const ok = await callCollection(consentPOST, "/api/screening/consent", mgmt, "POST", {
      prospectUserId: "u_prospect",
      scopeText: "Custom scope text presented to the prospect.",
    });
    expect(ok.status).toBe(201);
    expect(ok.json.consent.scopeText).toBe("Custom scope text presented to the prospect.");
    expect(ok.json.consent.recordedBy).toBe("u_mgmt");

    // org_2 management cannot record consent for an org_1 prospect.
    const mgmt2 = await loginAs("manager2@inssnapp.demo");
    const cross = await callCollection(consentPOST, "/api/screening/consent", mgmt2, "POST", {
      prospectUserId: "u_prospect",
    });
    expect(cross.status).toBe(404);
  });

  it("consent records are listed org-scoped for privileged roles", async () => {
    const admin = await loginAsAdmin();
    const { status, json } = await callCollection(consentGET, "/api/screening/consent", admin);
    expect(status).toBe(200);
    expect(json.consentRecords.length).toBeGreaterThan(0);
    expect(json.consentRecords.every((c: any) => c.organizationId === "org_1")).toBe(true);

    const prospect = await loginAs("prospect@inssnapp.demo");
    expect((await callCollection(consentGET, "/api/screening/consent", prospect)).status).toBe(403);
  });
});

describeMem("screening requests (consent fail-closed)", () => {
  it("refuses without a consent record (409)", async () => {
    const mgmt = await loginAs("manager@inssnapp.demo");
    // u_broker is a user in org_1 with no consent record.
    const { status, json } = await callCollection(requestPOST, "/api/screening/request", mgmt, "POST", {
      prospectUserId: "u_broker",
    });
    expect(status).toBe(409);
    expect(json.code).toBe("screening_consent_required");
  });

  it("creates a deterministic sandbox report once consent exists", async () => {
    const mgmt = await loginAs("manager@inssnapp.demo");
    // Consent already recorded for u_prospect in the consent tests above
    // (shared in-memory store) — this exercises the real dependency.
    const { status, json } = await callCollection(requestPOST, "/api/screening/request", mgmt, "POST", {
      prospectUserId: "u_prospect",
      fixture: "review",
    });
    expect(status).toBe(201);
    expect(json.report.mode).toBe("sandbox");
    expect(json.report.status).toBe("review");
    expect(json.report.detail).toContain("SANDBOX FIXTURE");
    expect(json.report.organizationId).toBe("org_1");
    expect(json.report.requestedBy).toBe("u_mgmt");

    // Visible on the status endpoint.
    const admin = await loginAsAdmin();
    const statusRes = await callCollection(screeningGET, "/api/screening", admin);
    expect(statusRes.json.recentScreenings.some((r: any) => r.id === json.report.id)).toBe(true);
  });

  it("rejects an unknown fixture and non-privileged requesters", async () => {
    const mgmt = await loginAs("manager@inssnapp.demo");
    const bad = await callCollection(requestPOST, "/api/screening/request", mgmt, "POST", {
      prospectUserId: "u_prospect",
      fixture: "guaranteed-approval",
    });
    expect(bad.status).toBe(400);

    const prospect = await loginAs("prospect@inssnapp.demo");
    expect(
      (await callCollection(requestPOST, "/api/screening/request", prospect, "POST", {
        prospectUserId: "u_prospect",
      })).status,
    ).toBe(403);
  });

  it("org_2 management cannot request a screening for an org_1 prospect", async () => {
    const mgmt2 = await loginAs("manager2@inssnapp.demo");
    const { status } = await callCollection(requestPOST, "/api/screening/request", mgmt2, "POST", {
      prospectUserId: "u_prospect",
    });
    expect(status).toBe(404);
  });
});

describeMem("integrations status reflects real screening state", () => {
  it("the Screening entry reports the live sandbox mode (no hardcoded badge)", async () => {
    const admin = await loginAsAdmin();
    const { status, json } = await callCollection(integrationsGET, "/api/integrations", admin);
    expect(status).toBe(200);
    const screening = json.integrations.find((i: any) => i.name === "Screening");
    expect(screening).toBeDefined();
    expect(screening.status).toBe("sandbox");
    expect(screening.detail).toContain("mode: SANDBOX");
    expect(screening.detail).toContain("checkr-sandbox");
  });
});
