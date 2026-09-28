/**
 * Broker flow logic (TASK-006) — pure functions over API data.
 *
 * One-screen workflow: assignment queue → accept/decline assignment →
 * check-in → showing status → complete + rate.
 */

import type { Showing, ShowingState } from "../api/types";
import { sortByNewest } from "./common";

export type BrokerAction =
  | "accept-assignment"
  | "decline-assignment"
  | "check-in"
  | "complete"
  | "rate";

const QUEUE_STATES: ShowingState[] = ["BROKER_GATE", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];

/**
 * The broker's assignment queue: showings assigned to them that still
 * need attention (awaiting their accept, check-in, completion, or rating).
 */
export function brokerQueue(showings: Showing[], userId: string): Showing[] {
  return sortByNewest(
    showings.filter((s) => s.brokerUserId === userId && QUEUE_STATES.includes(s.state)),
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
