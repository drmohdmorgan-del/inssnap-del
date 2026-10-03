/**
 * Mobile web (/m) flow logic — pure functions over API data.
 *
 * Mirrors apps/mobile/src/flows/prospect.ts and apps/mobile/src/flows/broker.ts
 * exactly (same rules, same ordering). Workflow rules live in the Showing
 * Engine server-side; these functions only shape what the UI shows.
 */

import type { Showing, ShowingState, Unit } from "./types";

export type ProspectAction = "apply" | "watch" | "decline";

export type BrokerAction =
  | "accept-assignment"
  | "decline-assignment"
  | "check-in"
  | "complete"
  | "rate";

function sortByNewest(showings: Showing[]): Showing[] {
  return [...showings].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Units a prospect may request: eligible AND resident availability on. */
export function discoverableUnits(units: Unit[]): Unit[] {
  return units
    .filter((u) => u.eligible && u.residentAvailable)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function unitMatchesQuery(unit: Unit, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    unit.label.toLowerCase().includes(q) ||
    (unit.pmsExternalId ?? "").toLowerCase().includes(q)
  );
}

const PROSPECT_ACTIVE: ShowingState[] = [
  "REQUESTED",
  "RESIDENT_ACCEPTED",
  "BROKER_GATE",
  "CONFIRMED",
  "IN_PROGRESS",
];

/** The prospect's requests still moving through the workflow, newest first. */
export function prospectActiveRequests(showings: Showing[], userId: string): Showing[] {
  return sortByNewest(
    showings.filter((s) => s.prospectUserId === userId && PROSPECT_ACTIVE.includes(s.state)),
  );
}

/** Outcome actions are offered once the showing completed. */
export function prospectActions(state: ShowingState): ProspectAction[] {
  return state === "COMPLETED" ? ["apply", "watch", "decline"] : [];
}

const BROKER_QUEUE_STATES: ShowingState[] = [
  "BROKER_GATE",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
];

/**
 * The broker's assignment queue: showings assigned to them that still
 * need attention (awaiting their accept, check-in, completion, or rating).
 */
export function brokerQueue(showings: Showing[], userId: string): Showing[] {
  return sortByNewest(
    showings.filter((s) => s.brokerUserId === userId && BROKER_QUEUE_STATES.includes(s.state)),
  );
}

/** Which actions the broker UI offers for a showing state. */
export function brokerActions(state: ShowingState): BrokerAction[] {
  switch (state) {
    case "BROKER_GATE":
      return ["accept-assignment", "decline-assignment"];
    case "CONFIRMED":
      return ["check-in"];
    case "IN_PROGRESS":
      return ["complete"];
    case "COMPLETED":
      return ["rate"];
    default:
      return [];
  }
}

export type ResidentAction = "accept" | "decline" | "check-in" | "complete" | "rate";

/** States where the resident still has something to do or watch. */
const RESIDENT_ACTIVE_STATES: ShowingState[] = [
  "REQUESTED",
  "RESIDENT_ACCEPTED",
  "BROKER_GATE",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
];

/** Incoming requests waiting for the resident's decision. */
export function residentInbox(showings: Showing[], userId: string): Showing[] {
  return sortByNewest(
    showings.filter((s) => s.residentUserId === userId && s.state === "REQUESTED"),
  );
}

/** The resident's live showings (not yet closed with an outcome). */
export function residentActive(showings: Showing[], userId: string): Showing[] {
  return sortByNewest(
    showings.filter(
      (s) => s.residentUserId === userId && RESIDENT_ACTIVE_STATES.includes(s.state),
    ),
  );
}

/** Which actions the resident UI offers for a showing state. */
export function residentActions(state: ShowingState): ResidentAction[] {
  switch (state) {
    case "REQUESTED":
      return ["accept", "decline"];
    case "CONFIRMED":
      return ["check-in"];
    case "IN_PROGRESS":
      return ["complete"];
    case "COMPLETED":
      return ["rate"];
    default:
      return [];
  }
}
