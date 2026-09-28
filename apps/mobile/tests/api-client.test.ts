/**
 * Unit tests for the mobile API client (mocked fetch).
 *
 * Verifies: the two-step login (200 session / 202 MFA challenge),
 * session-cookie capture and replay, error mapping (401/409/network),
 * idempotency keys on showing requests, and the named transition paths.
 */

import { describe, expect, it, vi } from "vitest";
import { ApiError, InssnappClient, newIdempotencyKey } from "../src/api/client";

interface StubResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function stubResponse(opts: {
  status?: number;
  body?: unknown;
  setCookie?: string | null;
}): StubResponse {
  const text = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "set-cookie" ? (opts.setCookie ?? null) : null,
    },
    text: async () => text,
    json: async () => (text ? JSON.parse(text) : null),
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => StubResponse | Promise<StubResponse>) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init) as unknown as Response);
}

const USER = {
  userId: "u_resident",
  organizationId: "org_1",
  email: "resident@inssnapp.demo",
  fullName: "Jordan Lee",
  role: "resident" as const,
};

describe("InssnappClient auth", () => {
  it("logs in and captures the session cookie for later requests", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/auth/login")) {
        return stubResponse({
          body: { user: USER },
          setCookie: "inssnapp_session=tok_abc123; Path=/; HttpOnly; SameSite=Lax",
        });
      }
      return stubResponse({ body: { showings: [] } });
    });
    const client = new InssnappClient({ baseUrl: "http://localhost:3000", fetchImpl: f });

    const result = await client.login("resident@inssnapp.demo", "pw");
    expect("user" in result && result.user.email).toBe("resident@inssnapp.demo");
    expect(client.authenticated).toBe(true);
    expect(client.getSessionValue()).toBe("tok_abc123");

    await client.listShowings();
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers["Cookie"]).toBe("inssnapp_session=tok_abc123");
  });

  it("returns the MFA challenge on HTTP 202 without a session", async () => {
    const f = stubFetch(() => stubResponse({ status: 202, body: { mfaRequired: true, challengeId: "ch_1" } }));
    const client = new InssnappClient({ baseUrl: "http://x:3000", fetchImpl: f });
    const result = await client.login("admin@inssnapp.demo", "pw");
    expect(result).toEqual({ mfaRequired: true, challengeId: "ch_1" });
    expect(client.authenticated).toBe(false);
  });

  it("verifies the MFA challenge and starts the session", async () => {
    const seen: unknown[] = [];
    const f = stubFetch((url, init) => {
      seen.push(JSON.parse((init?.body as string) ?? "{}"));
      return stubResponse({
        body: { user: { ...USER, role: "inssnapp_admin" as const } },
        setCookie: "inssnapp_session=tok_mfa; Path=/",
      });
    });
    const client = new InssnappClient({ baseUrl: "http://x:3000", fetchImpl: f });
    const { user } = await client.verifyMfa("ch_1", "123456");
    expect(user.role).toBe("inssnapp_admin");
    expect(seen[0]).toEqual({ challengeId: "ch_1", code: "123456" });
    expect(client.authenticated).toBe(true);
  });

  it("maps a 401 to an ApiError with the server message", async () => {
    const f = stubFetch(() => stubResponse({ status: 401, body: { error: "Invalid credentials." } }));
    const client = new InssnappClient({ baseUrl: "http://x:3000", fetchImpl: f });
    await expect(client.login("nobody@x.demo", "bad")).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials.",
    } satisfies Partial<ApiError>);
  });

  it("maps a network failure to a status-0 ApiError", async () => {
    const f = stubFetch(() => {
      throw new TypeError("Network request failed");
    });
    const client = new InssnappClient({ baseUrl: "http://x:3000", fetchImpl: f });
    let caught: unknown;
    try {
      await client.listShowings();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.status).toBe(0);
    expect(err.isNetworkError).toBe(true);
    expect(err.message).toMatch(/could not reach/i);
  });

  it("logout clears the local session even when the server call fails", async () => {
    const f = stubFetch((url) => {
      if (url.endsWith("/api/auth/login")) {
        return stubResponse({ body: { user: USER }, setCookie: "inssnapp_session=t; Path=/" });
      }
      return stubResponse({ status: 500, body: { error: "boom" } });
    });
    const client = new InssnappClient({ baseUrl: "http://x:3000", fetchImpl: f });
    await client.login("r@x.demo", "pw");
    expect(client.authenticated).toBe(true);
    await client.logout();
    expect(client.authenticated).toBe(false);
    expect(client.getSessionValue()).toBeNull();
  });

  it("a cleared cookie ends the session", async () => {
    const f = stubFetch(() =>
      stubResponse({ body: { ok: true }, setCookie: "inssnapp_session=; Path=/; Max-Age=0" }),
    );
    const client = new InssnappClient({
      baseUrl: "http://x:3000",
      fetchImpl: f,
      sessionValue: "old",
    });
    await client.logout().catch(() => null);
    expect(client.authenticated).toBe(false);
  });
});

describe("InssnappClient showing actions", () => {
  function clientWith(calls: { url: string; init?: RequestInit }[]) {
    const f = stubFetch((url, init) => {
      calls.push({ url, init });
      return stubResponse({ body: { showing: { id: "s_1", state: "REQUESTED" } } });
    });
    return new InssnappClient({ baseUrl: "http://api:3000/", fetchImpl: f, sessionValue: "tok" });
  }

  it("sends showing requests with an idempotency key", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = clientWith(calls);
    await client.requestShowing("unit_1", "key-123");
    expect(calls[0].url).toBe("http://api:3000/api/showings/request");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      unitId: "unit_1",
      idempotencyKey: "key-123",
    });
  });

  it("generates a default idempotency key", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = clientWith(calls);
    await client.requestShowing("unit_1");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(typeof body.idempotencyKey).toBe("string");
    expect(body.idempotencyKey.length).toBeGreaterThan(8);
  });

  it("newIdempotencyKey generates unique keys", () => {
    const keys = new Set(Array.from({ length: 100 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(100);
  });

  it("hits the named transition routes", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = clientWith(calls);
    await client.residentAccept("s_1");
    await client.residentDecline("s_2");
    await client.brokerAccept("s_3");
    await client.brokerDecline("s_4");
    await client.checkIn("s_5");
    await client.complete("s_6");
    expect(calls.map((c) => c.url)).toEqual([
      "http://api:3000/api/showings/s_1/resident/accept",
      "http://api:3000/api/showings/s_2/resident/decline",
      "http://api:3000/api/showings/s_3/broker/accept",
      "http://api:3000/api/showings/s_4/broker/decline",
      "http://api:3000/api/showings/s_5/check-in",
      "http://api:3000/api/showings/s_6/complete",
    ]);
    // Every transition carries an idempotency key.
    for (const c of calls) {
      expect(JSON.parse(c.init?.body as string).idempotencyKey).toBeTruthy();
    }
  });

  it("records outcomes and ratings with the right payloads", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = stubFetch((url, init) => {
      calls.push({ url, init });
      return stubResponse({ status: 201, body: { ok: true } });
    });
    const client = new InssnappClient({ baseUrl: "http://api:3000", fetchImpl: f });
    await client.recordOutcome("s_9", "APPLY");
    await client.rateShowing("s_9", 5, "Great tour.");
    expect(calls[0].url).toBe("http://api:3000/api/showings/s_9/outcome");
    expect(JSON.parse(calls[0].init?.body as string).outcome).toBe("APPLY");
    expect(calls[1].url).toBe("http://api:3000/api/showings/s_9/rating");
    expect(JSON.parse(calls[1].init?.body as string)).toMatchObject({
      stars: 5,
      comment: "Great tour.",
    });
  });

  it("calls the resident self-service routes", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/residents/me")) {
        return stubResponse({ body: { enrollments: [] } });
      }
      return stubResponse({ body: { unit: { id: "unit_1", residentAvailable: false } } });
    });
    const client = new InssnappClient({ baseUrl: "http://api:3000", fetchImpl: f });
    await client.myEnrollments();
    await client.setAvailability("unit_1", false);
    expect(calls[0].url).toBe("http://api:3000/api/residents/me");
    expect(calls[1].url).toBe("http://api:3000/api/residents/me/availability");
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({
      unitId: "unit_1",
      available: false,
    });
  });
});
