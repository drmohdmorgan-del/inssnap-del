/**
 * Contact-us endpoint tests.
 *
 * Drives POST /api/contact through the real Next.js route handler on the
 * in-memory store path: validation rejects bad input, valid submissions
 * are stored. Skipped when DATABASE_URL is set.
 */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as contactPOST } from "../app/api/contact/route";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: "Jordan Lee",
  email: "jordan@example.com",
  company: "Acme Property Group",
  role: "property_manager",
  message: "We manage 400 units in Boston and want to discuss a pilot.",
};

describeMem("POST /api/contact", () => {
  it("accepts a valid submission", async () => {
    const res = await contactPOST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects a missing name", async () => {
    const res = await contactPOST(req({ ...valid, name: " " }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const res = await contactPOST(req({ ...valid, email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rejects a too-short message", async () => {
    const res = await contactPOST(req({ ...valid, message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid role", async () => {
    const res = await contactPOST(req({ ...valid, role: "superadmin" }));
    expect(res.status).toBe(400);
  });

  it("accepts a minimal submission without optional fields", async () => {
    const res = await contactPOST(
      req({ name: "Taylor Brooks", email: "taylor@example.com", message: "Interested in a pilot for our portfolio." })
    );
    expect(res.status).toBe(200);
  });
});
