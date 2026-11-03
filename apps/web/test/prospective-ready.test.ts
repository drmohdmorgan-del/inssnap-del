/**
 * Prospective "Ready" tier (DrMorgan 2026-11-03) — API tests.
 *
 *   - GET/POST /api/prospects/me — application profile, tier selection,
 *     packet readiness (application / documents / screening)
 *   - Readiness is PRE-ASSEMBLED, never pre-approved: after consent +
 *     a completed (sandbox) screening + a complete application + all
 *     document records, packetAssembled is true — and the Management
 *     profile view exposes the packet with per-credential SOURCE +
 *     verification state (decisions come from verified sources, not
 *     from applicant-uploaded documents)
 *   - Residents never see the readyPacket block (financial detail)
 *   - The free base stays fully functional: readiness work is additive
 *
 * Skipped when DATABASE_URL is set — these pin the in-memory path.
 */

import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST as loginPOST } from "../app/api/auth/login/route";
import { GET as meGET, POST as mePOST } from "../app/api/prospects/me/route";
import { POST as consentPOST } from "../app/api/screening/consent/route";
import { POST as requestPOST } from "../app/api/screening/request/route";
import { GET as profileGET } from "../app/api/prospects/[id]/profile/route";
import { POST as requestShowingPOST } from "../app/api/showings/request/route";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

type Handler = (req: NextRequest) => Promise<NextResponse>;

async function loginAs(email: string, password = "pw"): Promise<string> {
  const req = new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const res = await loginPOST(req);
  expect(res.status, `login as ${email}`).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

function call(handler: Handler, url: string, cookie: string, body?: unknown) {
  const req = new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(req);
}

describeMem("prospective Ready tier", () => {
  it("starts on free base with an incomplete packet", async () => {
    const cookie = await loginAs("prospect@inssnapp.demo");
    const res = await call(meGET, "http://localhost/api/prospects/me", cookie);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tier).toBe("base");
    expect(data.readiness.applicationComplete).toBe(false);
    expect(data.readiness.packetAssembled).toBe(false);
    expect(data.tiers.ready.priceUsd).toBe(49); // config draft at the market anchor
  });

  it("validates input and prospect-only access", async () => {
    const cookie = await loginAs("prospect@inssnapp.demo");
    const badTier = await call(mePOST, "http://localhost/api/prospects/me", cookie, { tier: "gold" });
    expect(badTier.status).toBe(400);
    const badDocs = await call(mePOST, "http://localhost/api/prospects/me", cookie, {
      documents: ["passport_scan"],
    });
    expect(badDocs.status).toBe(400);
    const brokerCookie = await loginAs("broker@inssnapp.demo");
    const forbiddenRes = await call(meGET, "http://localhost/api/prospects/me", brokerCookie);
    expect(forbiddenRes.status).toBe(403);
  });

  it("assembles the packet: application + documents + screening -> packetAssembled", async () => {
    const prospect = await loginAs("prospect@inssnapp.demo");
    const mgmt = await loginAs("manager@inssnapp.demo");

    const save = await call(mePOST, "http://localhost/api/prospects/me", prospect, {
      tier: "ready",
      moveInDate: "2026-12-01",
      occupants: 2,
      hasPets: false,
      employmentStatus: "Employed — hospital RN",
      incomeRange: "$80k-$100k",
      statement: "Quiet, long-term tenants.",
      documents: ["government_id", "proof_of_income", "rental_history"],
    });
    expect(save.status).toBe(200);
    let data = await save.json();
    expect(data.tier).toBe("ready");
    expect(data.readiness.applicationComplete).toBe(true);
    expect(data.readiness.documentsLoaded).toBe(true);
    expect(data.readiness.screeningCompleted).toBe(false);
    expect(data.readiness.packetAssembled).toBe(false);

    // Consent (prospect self) then Management runs the Checkr sandbox.
    const consent = await call(consentPOST, "http://localhost/api/screening/consent", prospect, {
      prospectUserId: "u_prospect",
    });
    expect(consent.status).toBe(201);
    const run = await call(requestPOST, "http://localhost/api/screening/request", mgmt, {
      prospectUserId: "u_prospect",
    });
    expect(run.status).toBe(201);

    const after = await call(meGET, "http://localhost/api/prospects/me", prospect);
    data = await after.json();
    expect(data.readiness.screeningCompleted).toBe(true);
    expect(data.readiness.packetAssembled).toBe(true);

    // Management's profile view: packet + per-credential source/state.
    const req = new NextRequest("http://localhost/api/prospects/u_prospect/profile", {
      headers: { Cookie: mgmt },
    });
    const profRes = await profileGET(req, { params: Promise.resolve({ id: "u_prospect" }) });
    expect(profRes.status).toBe(200);
    const prof = await profRes.json();
    expect(prof.readyPacket).not.toBeNull();
    expect(prof.readyPacket.packetAssembled).toBe(true);
    const screening = (prof.readyPacket.verification as Array<Record<string, string>>).find(
      (v) => v.credential === "Background screening",
    );
    expect(screening?.source).toContain("Checkr");
    const docs = (prof.readyPacket.verification as Array<Record<string, string>>).find(
      (v) => v.credential === "Documents",
    );
    expect(docs?.source).toContain("not evidence");

    // Instant submit: picking a unit submits the standing Ready
    // application by reference — no assembly step at submit time.
    const submitReq = await call(requestShowingPOST, "http://localhost/api/showings/request", prospect, {
      unitId: "unit_1",
      idempotencyKey: "ready-submit-1",
    });
    expect(submitReq.status).toBe(201);
    const submitJson = await submitReq.json();
    expect(submitJson.readyApplication.submitted).toBe(true);
    expect(submitJson.readyApplication.packetAssembled).toBe(true);

    // Residents never see the packet block.
    const resident = await loginAs("resident@inssnapp.demo");
    const resReq = new NextRequest("http://localhost/api/prospects/u_prospect/profile", {
      headers: { Cookie: resident },
    });
    const resRes = await profileGET(resReq, { params: Promise.resolve({ id: "u_prospect" }) });
    // Resident shares no showing with this prospect in seed -> 403, or a
    // profile without the packet. Either way: no readyPacket exposure.
    if (resRes.status === 200) {
      expect((await resRes.json()).readyPacket).toBeNull();
    } else {
      expect(resRes.status).toBe(403);
    }
  });
});
