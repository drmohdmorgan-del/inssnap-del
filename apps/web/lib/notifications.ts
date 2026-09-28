/**
 * Showing-lifecycle notification dispatch (TASK-008).
 *
 * Maps engine transitions to NotificationEvents and resolves recipients
 * from the showing + user directory, then delivers through the
 * NotificationAdapter interface via notifySafely (fail-open: a provider
 * failure is logged and never breaks the transition that triggered it).
 *
 * Mapped transitions:
 *   PROSPECT_REQUEST → showing.request_received (resident + prospect)
 *   RESIDENT_ACCEPT  → showing.accepted        (prospect)
 *   RESIDENT_DECLINE → showing.declined        (prospect)
 *   CONFIRM          → showing.confirmed       (prospect + resident)
 *   COMPLETE         → showing.completed       (prospect)
 *
 * "showing.reminder" exists on the interface for a future reminder
 * scheduler; no scheduler is wired in this task. Transitions not listed
 * here (broker gate, check-in, outcome, expire) send nothing today.
 */

import type { Showing, Transition } from "@inssnapp/engine";
import {
  notifySafely,
  type NotificationEventName,
  type NotificationPayload,
  type NotificationRecipient,
} from "@inssnapp/integrations";
import { db } from "./db";
import { getAuthStore } from "./auth-store";

const TRANSITION_EVENTS: Partial<Record<Transition, NotificationEventName>> = {
  PROSPECT_REQUEST: "showing.request_received",
  RESIDENT_ACCEPT: "showing.accepted",
  RESIDENT_DECLINE: "showing.declined",
  CONFIRM: "showing.confirmed",
  COMPLETE: "showing.completed",
};

const EVENT_RECIPIENT_ROLES: Record<NotificationEventName, Array<"resident" | "prospect">> = {
  "showing.request_received": ["resident", "prospect"],
  "showing.accepted": ["prospect"],
  "showing.declined": ["prospect"],
  "showing.confirmed": ["prospect", "resident"],
  "showing.reminder": ["prospect", "resident"],
  "showing.completed": ["prospect"],
  "pms.sync_completed": [],
  "pms.sync_failed": [],
};

async function resolveRecipient(
  role: "resident" | "prospect",
  showing: Showing,
): Promise<NotificationRecipient | null> {
  const userId =
    role === "resident" ? showing.residentUserId : showing.prospectUserId;
  if (!userId) return null;
  let email: string | null = null;
  try {
    const user = await getAuthStore().getUserById(userId);
    email = user?.email ?? null;
  } catch {
    // Directory lookup is best-effort; the notification still goes out
    // with the userId/role for the dev console adapter.
  }
  return { role, userId, email };
}

function eventSummary(
  event: NotificationEventName,
  unitLabel: string | null,
  propertyName: string | null,
): string {
  const where = [propertyName, unitLabel ? `unit ${unitLabel}` : null]
    .filter(Boolean)
    .join(" · ");
  const location = where ? ` (${where})` : "";
  switch (event) {
    case "showing.request_received":
      return `Showing request received${location}.`;
    case "showing.accepted":
      return `Showing request accepted${location}.`;
    case "showing.declined":
      return `Showing request declined${location}.`;
    case "showing.confirmed":
      return `Showing confirmed${location}.`;
    case "showing.reminder":
      return `Showing reminder${location}.`;
    case "showing.completed":
      return `Showing completed${location}.`;
    default:
      return `Showing event ${event}${location}.`;
  }
}

/**
 * Sends the showing.reminder notification for one CONFIRMED showing
 * (TASK-010 cron). Fail-open like all notification dispatch: a provider
 * failure is logged and never breaks the caller. Never throws.
 */
export async function notifyShowingReminder(showing: Showing): Promise<void> {
  const recipientRoles = EVENT_RECIPIENT_ROLES["showing.reminder"];
  const recipients: NotificationRecipient[] = [];
  for (const role of recipientRoles) {
    const r = await resolveRecipient(role, showing);
    if (r) recipients.push(r);
  }

  let unitLabel: string | null = null;
  let propertyName: string | null = null;
  try {
    const unit = await db.units.byId(showing.unitId);
    unitLabel = unit?.label ?? null;
    if (unit) {
      const property = await db.properties.byId(unit.propertyId);
      propertyName = property?.name ?? null;
    }
  } catch {
    // Enrichment is best-effort; the summary degrades gracefully.
  }

  const payload: NotificationPayload = {
    event: "showing.reminder",
    organizationId: showing.organizationId,
    at: new Date().toISOString(),
    showingId: showing.id,
    unitLabel,
    propertyName,
    actorRole: "system",
    recipients,
    summary: `Reminder: your showing${unitLabel ? ` for unit ${unitLabel}` : ""} is confirmed.`,
  };
  await notifySafely(payload);
}

/**
 * Fires the notification for a completed showing transition. Never throws —
 * safe to call after the engine has committed the transition. Idempotent
 * replays must NOT notify (callers skip when result.replayed is true).
 */
export async function notifyShowingTransition(
  transition: Transition,
  showing: Showing,
  actorRole: string,
): Promise<void> {
  const event = TRANSITION_EVENTS[transition];
  if (!event) return;

  const recipientRoles = EVENT_RECIPIENT_ROLES[event];
  const recipients: NotificationRecipient[] = [];
  for (const role of recipientRoles) {
    const r = await resolveRecipient(role, showing);
    if (r) recipients.push(r);
  }

  let unitLabel: string | null = null;
  let propertyName: string | null = null;
  try {
    const unit = await db.units.byId(showing.unitId);
    unitLabel = unit?.label ?? null;
    if (unit) {
      const property = await db.properties.byId(unit.propertyId);
      propertyName = property?.name ?? null;
    }
  } catch {
    // Enrichment is best-effort; the summary degrades gracefully.
  }

  const payload: NotificationPayload = {
    event,
    organizationId: showing.organizationId,
    at: new Date().toISOString(),
    showingId: showing.id,
    unitLabel,
    propertyName,
    actorRole,
    recipients,
    summary: eventSummary(event, unitLabel, propertyName),
  };
  await notifySafely(payload);
}
