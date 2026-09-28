/**
 * Notification adapter boundary (TASK-008).
 *
 * `notify(event, payload)` covers the showing lifecycle events the engine
 * produces — request received, accepted/declined, confirmed, reminder,
 * completed — plus PMS sync events. The Showing Engine and the API routes
 * depend ONLY on this interface; the concrete provider (console log today,
 * Twilio SMS / SES email tomorrow) is selected at runtime through the
 * module-level registry. Swapping the provider never touches engine code.
 *
 * Fail-open by contract: `notifySafely` catches every provider failure, logs
 * it, and resolves. A notification outage must never break a showing
 * transition or a PMS sync.
 */

/** Showing lifecycle + integration events the platform can announce. */
export type NotificationEventName =
  | "showing.request_received"
  | "showing.accepted"
  | "showing.declined"
  | "showing.confirmed"
  | "showing.reminder"
  | "showing.completed"
  | "pms.sync_completed"
  | "pms.sync_failed";

/**
 * Who should hear about the event. Recipients are resolved by the caller
 * (it owns the user directory); the adapter just delivers. Email is
 * best-effort — dev adapters log the userId/role instead.
 */
export interface NotificationRecipient {
  role?: string;
  userId?: string;
  email?: string | null;
}

/** Everything a provider needs to render and route one notification. */
export interface NotificationPayload {
  event: NotificationEventName;
  organizationId: string;
  at: string;
  showingId?: string;
  unitLabel?: string | null;
  propertyName?: string | null;
  actorRole?: string;
  recipients: NotificationRecipient[];
  /** One human-readable line, e.g. "Unit 1A: showing request received." */
  summary: string;
  /** Provider-specific extras (template id, deep link, …). */
  meta?: Record<string, unknown>;
}

export interface NotificationResult {
  ok: boolean;
  providerMessageId?: string;
}

/**
 * The provider contract. Implementations must be idempotent-friendly and
 * must surface transport failures as rejections — the caller decides how
 * to handle them (see notifySafely).
 */
export interface NotificationAdapter {
  /** Provider discriminator: "console" | "twilio" | "ses" | … */
  readonly name: string;
  notify(payload: NotificationPayload): Promise<NotificationResult>;
}

/**
 * Dev default: structured log lines, no real SMS/email. This is the adapter
 * the web app uses until a real provider is registered — the "Notifications"
 * status in the UI reports this honestly instead of claiming connectivity.
 */
export class ConsoleNotificationAdapter implements NotificationAdapter {
  readonly name = "console";

  async notify(payload: NotificationPayload): Promise<NotificationResult> {
    const to = payload.recipients
      .map((r) => r.email ?? r.userId ?? r.role ?? "?")
      .join(", ");
    console.log(
      `[inssnapp:notify] event=${payload.event} org=${payload.organizationId} ` +
        `to=[${to}] summary=${JSON.stringify(payload.summary)}`,
    );
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}

let current: NotificationAdapter = new ConsoleNotificationAdapter();

/**
 * Registers the provider for this process. A real SMS/email provider is
 * installed here at boot (or per-tenant later) without touching the engine
 * or the routes that call notifySafely.
 */
export function setNotificationAdapter(adapter: NotificationAdapter): void {
  current = adapter;
}

/** Restores the dev console default (used by tests and local dev). */
export function resetNotificationAdapter(): void {
  current = new ConsoleNotificationAdapter();
}

export function getNotificationAdapter(): NotificationAdapter {
  return current;
}

/**
 * Delivers a notification without ever throwing. Provider failures are
 * logged and swallowed — callers (showing routes, sync jobs) treat a
 * notification as a side effect that must not break the primary workflow.
 */
export async function notifySafely(payload: NotificationPayload): Promise<void> {
  try {
    await current.notify(payload);
  } catch (err) {
    console.error(
      `[inssnapp:notify] provider "${current.name}" failed for event=${payload.event} ` +
        `org=${payload.organizationId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
