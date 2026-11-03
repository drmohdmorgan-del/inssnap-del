/**
 * Broker license vetting (DrMorgan 2026-11-03) — API tests.
 *
 * Drives the real route handlers on the in-memory store path:
 *   - GET/POST /api/brokers/me/license — broker submits number + state
 *   - GET/POST /api/control/broker-licenses — Management/Admin vetting
 *     queue + registry-verification outcome
 *   - parseBrokerAssignBody — the operating gate: no verified license,
 *     no lead assignments (403, licenseNotVerified)
 *   - referralPctForPrice — the Zillow/Redfin-benchmark referral ladder
 *     (share of the broker's commission, tiered by deal price band)
 *
 * Skipped when DATABASE_URL is set — these pin the in-memory path.
 */

import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { POST as loginPOST } from "../app/api/auth/login/route";
import {
  GET as myLicenseGET,
  POST as myLicensePOST,
} from "../app/api/brokers/me/license/route";
import {
  GET as queueGET,
  POST as queuePOST,
} from "../app/api/control/broker-licenses/route";
import { parseBrokerAssignBody } from "../lib/showing-api";
import { referralPctForPrice } from "../lib/broker-tiers";
import type { SessionUser } from "@inssnapp/auth";

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

const MGMT: SessionUser = {
  userId: "u_mgmt",
  organizationId: "org_1",
  email: "manager@inssnapp.demo",
  fullName: "Morgan Reyes",
  role: "management",
};

describeMem("broker license vetting", () => {
  it("seeded demo broker starts verified (synthetic seed license)", async () => {
    const cookie = await loginAs("broker@inssnapp.demo");
    const res = await call(myLicenseGET, "http://localhost/api/brokers/me/license", cookie);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.licenseStatus).toBe("verified");
    expect(data.licenseState).toBe("MA");
    expect(data.registry.authority).toContain("Massachusetts");
  });

  it("gate passes for the verified seed broker", async () => {
    const parsed = await parseBrokerAssignBody({ brokerUserId: "u_broker" }, MGMT);
    expect(parsed.ok).toBe(true);
  });

  it("rejects a bad state code and non-broker callers", async () => {
    const brokerCookie = await loginAs("broker@inssnapp.demo");
    const bad = await call(myLicensePOST, "http://localhost/api/brokers/me/license", brokerCookie, {
      licenseNumber: "X-1",
      licenseState: "XX",
    });
    expect(bad.status).toBe(400);

    const residentCookie = await loginAs("resident@inssnapp.demo");
    const forbiddenRes = await call(
      myLicensePOST,
      "http://localhost/api/brokers/me/license",
      residentCookie,
      { licenseNumber: "X-1", licenseState: "MA" },
    );
    expect(forbiddenRes.status).toBe(403);
  });

  it("resubmission -> pending -> gate blocks -> management verifies -> gate opens", async () => {
    const brokerCookie = await loginAs("broker@inssnapp.demo");
    const submit = await call(
      myLicensePOST,
      "http://localhost/api/brokers/me/license",
      brokerCookie,
      { licenseNumber: "TEST-LIC-2026", licenseState: "MA" },
    );
    expect(submit.status).toBe(200);
    expect((await submit.json()).licenseStatus).toBe("pending");

    // Gate blocks while pending.
    const blocked = await parseBrokerAssignBody({ brokerUserId: "u_broker" }, MGMT);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(403);
      const payload = await blocked.response.json();
      expect(payload.licenseNotVerified).toBe(true);
    }

    // Queue shows the pending submission with the MA registry attached.
    const mgmtCookie = await loginAs("manager@inssnapp.demo");
    const queueRes = await call(queueGET, "http://localhost/api/control/broker-licenses", mgmtCookie);
    expect(queueRes.status).toBe(200);
    const queue = (await queueRes.json()).queue as Array<Record<string, unknown>>;
    const item = queue.find((q) => q.brokerUserId === "u_broker");
    expect(item?.licenseStatus).toBe("pending");
    expect(item?.licenseNumber).toBe("TEST-LIC-2026");
    expect((item?.registry as { authority: string }).authority).toContain("Massachusetts");

    // Brokers cannot see the vetting queue.
    const brokerQueue = await call(
      queueGET,
      "http://localhost/api/control/broker-licenses",
      brokerCookie,
    );
    expect(brokerQueue.status).toBe(403);

    // Management verifies -> gate opens; a second review conflicts (409).
    const review = await call(queuePOST, "http://localhost/api/control/broker-licenses", mgmtCookie, {
      brokerUserId: "u_broker",
      decision: "verified",
      note: "Checked in MA DPL lookup — active.",
    });
    expect(review.status).toBe(200);
    expect((await review.json()).licenseStatus).toBe("verified");

    const again = await call(queuePOST, "http://localhost/api/control/broker-licenses", mgmtCookie, {
      brokerUserId: "u_broker",
      decision: "rejected",
    });
    expect(again.status).toBe(409);

    const open = await parseBrokerAssignBody({ brokerUserId: "u_broker" }, MGMT);
    expect(open.ok).toBe(true);
  });

  it("referral ladder: % of broker commission tiered by price band", () => {
    expect(referralPctForPrice(200_000)).toBe(30);
    expect(referralPctForPrice(350_000)).toBe(30);
    expect(referralPctForPrice(500_000)).toBe(35);
    expect(referralPctForPrice(750_000)).toBe(35);
    expect(referralPctForPrice(1_200_000)).toBe(40);
  });
});
