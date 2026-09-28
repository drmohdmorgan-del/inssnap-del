/**
 * TASK-008 — notification adapter tests.
 *
 * Proves the fail-open contract: a throwing provider never breaks the caller,
 * and the dev default is the honest console logger (no real SMS/email).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ConsoleNotificationAdapter,
  getNotificationAdapter,
  notifySafely,
  resetNotificationAdapter,
  setNotificationAdapter,
  type NotificationAdapter,
  type NotificationPayload,
} from "../src/index";

function payload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    event: "showing.request_received",
    organizationId: "org_1",
    at: new Date().toISOString(),
    recipients: [{ role: "resident", userId: "u_resident" }],
    summary: "Unit 1A: showing request received.",
    ...overrides,
  };
}

describe("NotificationAdapter boundary", () => {
  beforeEach(() => {
    resetNotificationAdapter();
  });

  it("defaults to the console adapter (dev honesty: no real SMS/email)", () => {
    expect(getNotificationAdapter().name).toBe("console");
    expect(getNotificationAdapter()).toBeInstanceOf(ConsoleNotificationAdapter);
  });

  it("console adapter logs a structured line and reports ok", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await getNotificationAdapter().notify(payload());
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("showing.request_received");
    spy.mockRestore();
  });

  it("notifySafely swallows a throwing provider and logs the failure", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing: NotificationAdapter = {
      name: "broken",
      notify: async () => {
        throw new Error("provider is down");
      },
    };
    setNotificationAdapter(throwing);

    // Must resolve — never reject — so callers treat notify as fire-and-forget.
    await expect(notifySafely(payload())).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledOnce();
    expect(errSpy.mock.calls[0][0]).toContain("broken");
    errSpy.mockRestore();
  });

  it("a registered provider replaces the default without engine changes", async () => {
    const seen: NotificationPayload[] = [];
    const fake: NotificationAdapter = {
      name: "fake-sms",
      notify: async (p) => {
        seen.push(p);
        return { ok: true, providerMessageId: "sms-1" };
      },
    };
    setNotificationAdapter(fake);
    expect(getNotificationAdapter().name).toBe("fake-sms");
    await notifySafely(payload({ event: "showing.confirmed" }));
    expect(seen).toHaveLength(1);
    expect(seen[0].event).toBe("showing.confirmed");
  });

  it("resetNotificationAdapter restores the console default", () => {
    setNotificationAdapter({ name: "x", notify: async () => ({ ok: true }) });
    resetNotificationAdapter();
    expect(getNotificationAdapter().name).toBe("console");
  });
});
