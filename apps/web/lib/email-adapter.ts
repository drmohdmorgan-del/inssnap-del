/**
 * Resend email notification adapter (pilot-readiness fix, 2026-11-05).
 *
 * Until now the web app only ever registered the console adapter from
 * @inssnapp/integrations: in production, signup verification codes and
 * showing-lifecycle notifications were written to the server log and
 * never reached a user's inbox — a dead end at step one of the pilot
 * flow (signup → verify). The project already sends its Demo Portal
 * activation mail through Resend (lib/demo-provision-core.js, shared
 * RESEND_API_KEY); this adapter gives the main app the same delivery
 * path through the provider-agnostic NotificationAdapter contract.
 *
 * Registration is env-gated and fail-safe:
 *   - RESEND_API_KEY unset → the console adapter stays; nothing here
 *     throws at import or boot.
 *   - Transport failures reject, so notifySafely logs them (the
 *     adapter contract) and the workflow that triggered the
 *     notification is never broken by a mail failure.
 *
 * Sender: INSSNAPP_EMAIL_FROM, defaulting to Resend's onboarding
 * sender — the same default the Demo Portal uses until a sending
 * domain is verified in Resend (a separate step, never faked here).
 */

import {
  getNotificationAdapter,
  setNotificationAdapter,
  type NotificationAdapter,
  type NotificationPayload,
  type NotificationResult,
} from "@inssnapp/integrations";

const DEFAULT_FROM = "INSSNAPP <onboarding@resend.dev>";
const DEFAULT_API_BASE = "https://api.resend.com";

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const SUBJECTS: Partial<Record<NotificationPayload["event"], string>> = {
  "auth.verification_code": "Your INSSNAPP verification code",
  "showing.request_received": "INSSNAPP — showing request received",
  "showing.accepted": "INSSNAPP — showing accepted",
  "showing.declined": "INSSNAPP — showing declined",
  "showing.confirmed": "INSSNAPP — showing confirmed",
  "showing.reminder": "INSSNAPP — showing reminder",
  "showing.completed": "INSSNAPP — showing completed",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class ResendNotificationAdapter implements NotificationAdapter {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly from: string;
  private readonly apiBase: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: {
    apiKey: string;
    from?: string;
    apiBase?: string;
    fetchImpl?: FetchImpl;
  }) {
    this.apiKey = opts.apiKey;
    this.from = opts.from || DEFAULT_FROM;
    this.apiBase = (opts.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async notify(payload: NotificationPayload): Promise<NotificationResult> {
    const emails = [
      ...new Set(
        payload.recipients
          .map((r) => r.email?.trim())
          .filter((e): e is string => !!e),
      ),
    ];
    if (emails.length === 0) {
      // No deliverable address (dev directory entries carry userId/role
      // only) — nothing to send; not a failure.
      return { ok: true };
    }
    const subject = SUBJECTS[payload.event] ?? "INSSNAPP notification";
    const text =
      `${payload.summary}\n\n` +
      `— INSSNAPP, Resident-Powered Leasing Infrastructure\n` +
      `A product of IEC, Inc. · Developed by IEC, Inc.`;
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#0A0A2E">` +
      `<p style="font-size:18px;font-weight:700;margin:0 0 12px">INSSNAPP</p>` +
      `<p style="font-size:15px;line-height:1.5;margin:0">${escapeHtml(payload.summary)}</p>` +
      `<p style="font-size:12px;color:#1B1B52B3;margin:16px 0 0">INSSNAPP — a product of IEC, Inc. · Developed by IEC, Inc.</p>` +
      `</div>`;
    let lastId: string | undefined;
    for (const to of emails) {
      const r = await this.fetchImpl(`${this.apiBase}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, text, html }),
      });
      const data = (await r.json().catch(() => ({}))) as { id?: string };
      if (!r.ok) {
        // Contract: transport failures reject so notifySafely logs them.
        throw new Error(`resend_${r.status}`);
      }
      lastId = data.id ?? lastId;
    }
    return { ok: true, providerMessageId: lastId };
  }
}

let registrationAttempted = false;

/**
 * Registers the Resend adapter when RESEND_API_KEY is configured.
 * Idempotent; a no-op without the key, so dev/test keep the console
 * adapter. Called from lib/notifications.ts module scope — the module
 * that dispatches — so registration lands in the same process/module
 * instance that sends.
 */
export function ensureEmailAdapterRegistered(): void {
  if (registrationAttempted) return;
  registrationAttempted = true;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  if (getNotificationAdapter().name !== "console") return;
  setNotificationAdapter(
    new ResendNotificationAdapter({
      apiKey,
      from: process.env.INSSNAPP_EMAIL_FROM || undefined,
      apiBase: process.env.INSSNAPP_RESEND_API_BASE || undefined,
    }),
  );
  console.log("[inssnapp] email notifications via Resend are enabled");
}
