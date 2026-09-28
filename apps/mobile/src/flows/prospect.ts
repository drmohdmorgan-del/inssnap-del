/**
 * Prospect flow logic (TASK-005) — pure functions over API data.
 *
 * One-screen workflow: eligible unit discovery → unit detail →
 * request showing → live request status → confirmed/showing status →
 * Apply / Watch / Decline outcome.
 */

import type { Showing, ShowingState, Unit } from "../api/types";
import { mineAs, sortByNewest } from "./common";

export type ProspectAction = "apply" | "watch" | "decline";

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

/** The prospect's requests, newest first. */
export function prospectRequests(showings: Showing[], userId: string): Showing[] {
  return mineAs(showings, userId, "prospectUserId");
}

/** Open requests still moving through the workflow. */
export function prospectActiveRequests(showings: Showing[], userId: string): Showing[] {
  const active: ShowingState[] = [
    "REQUESTED",
    "RESIDENT_ACCEPTED",
    "BROKER_GATE",
    "CONFIRMED",
    "IN_PROGRESS",
  ];
  return sortByNewest(
    showings.filter((s) => s.prospectUserId === userId && active.includes(s.state)),
  );
}

/** Outcome actions are offered once the showing completed. */
export function prospectActions(state: ShowingState): ProspectAction[] {
  return state === "COMPLETED" ? ["apply", "watch", "decline"] : [];
}
