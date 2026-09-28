/**
 * Resident flow logic (TASK-004) — pure functions over API data.
 *
 * One-screen workflow: Available NOW toggle → verified resident/unit
 * status → incoming request inbox → accept/decline → live showing
 * status → complete + rate.
 */

import type { Showing, ShowingState } from "../api/types";
import { mineAs, sortByNewest } from "./common";

export type ResidentAction = "accept" | "decline" | "check-in" | "complete" | "rate";

/** States where the resident still has something to do or watch. */
const ACTIVE_STATES: ShowingState[] = [
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
    showings.filter((s) => s.residentUserId === userId && ACTIVE_STATES.includes(s.state)),
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

export function residentHistory(showings: Showing[], userId: string): Showing[] {
  return mineAs(showings, userId, "residentUserId").filter((s) => !ACTIVE_STATES.includes(s.state));
}
