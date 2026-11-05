/**
 * Email adapter (pilot-readiness, 2026-11-05) — the Resend-backed
 * NotificationAdapter that replaces console-only delivery in
 * production. Pins the contract the pilot flow depends on:
 *   - verification-code payload → one Resend send per emailed
 *     recipient, with the code in the body and the IEC credit in the
 *     footer;
 *   - recipients without an email are skipped, never an error;
 *   - transport failure rejects (notifySafely logs it) instead of
 *     being swallowed;
 *   - registration is env-gated: no RESEND_API_KEY → console stays.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetNotificationAdapter,
  type NotificationPayload,
} from "@inssnapp/integrations";
import { ResendNotificationAdapter } from "../lib/email-adapter";

const payload: NotificationPayload = {
  event: "auth.verification_code",
  organizationId: "org_1",
  at: "2026-11-05T00:00:00.000Z",
  actorRole: "system",
  recipients: [{ email: "prospect@example.com" }],
  summary: "Your INSSNAPP verification code is 123456. It expires in 15 minutes.",
  meta: { code: "123456" },
};

function stubFetch(status = 200, body: unknown = { id: "msg_1" }) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

afterEach(() => {
  resetNotificationAdapter();
  delete process.env.RESEND_API_KEY;
  vi.restoreAllMocks();
});

describe("ResendNotificationAdapter", () => {
  it("sends the verification code via Resend with bearer auth", async () => {
    const fetchImpl = stubFetch();
    const adapter = new ResendNotificationAdapter({
      apiKey: "rk_test",
      fetchImpl: fetchImpl as never,
    });
    const result = await adapter.notify(payload);
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("msg_1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer rk_test");
    const sent = JSON.parse(init.body as string) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(sent.to).toEqual(["prospect@example.com"]);
    expect(sent.subject).toContain("verification code");
    expect(sent.text).toContain("123456");
    expect(sent.text).toContain("Developed by IEC, Inc.");
    expect(sent.from).toContain("INSSNAPP");
  });

  it("skips recipients without an email and dedupes addresses", async () => {
    const fetchImpl = stubFetch();
    const adapter = new ResendNotificationAdapter({
      apiKey: "rk_test",
      fetchImpl: fetchImpl as never,
    });
    const result = await adapter.notify({
      ...payload,
      recipients: [
        { role: "resident", userId: "u_1" },
        { email: "a@example.com" },
        { email: "a@example.com" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects on transport failure so notifySafely can log it", async () => {
    const fetchImpl = stubFetch(500, { message: "boom" });
    const adapter = new ResendNotificationAdapter({
      apiKey: "rk_test",
      fetchImpl: fetchImpl as never,
    });
    await expect(adapter.notify(payload)).rejects.toThrow("resend_500");
  });
});

describe("ensureEmailAdapterRegistered", () => {
  // The registration guard is module-level state, so each test gets a
  // fresh copy of the module (and of the integrations registry it
  // registers into).
  it("keeps the console adapter when RESEND_API_KEY is unset", async () => {
    vi.resetModules();
    const integrations = await import("@inssnapp/integrations");
    const { ensureEmailAdapterRegistered: ensure } = await import(
      "../lib/email-adapter"
    );
    ensure();
    expect(integrations.getNotificationAdapter().name).toBe("console");
  });

  it("registers the Resend adapter when the key is configured", async () => {
    vi.resetModules();
    process.env.RESEND_API_KEY = "rk_test";
    const integrations = await import("@inssnapp/integrations");
    const { ensureEmailAdapterRegistered: ensure } = await import(
      "../lib/email-adapter"
    );
    ensure();
    expect(integrations.getNotificationAdapter().name).toBe("resend");
  });
});
