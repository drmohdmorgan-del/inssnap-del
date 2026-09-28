/**
 * Shared display helpers for the role flows.
 *
 * These mirror the engine's state table for UI purposes ONLY (which
 * buttons to render). The Showing Engine server-side re-enforces every
 * rule — the client never authorizes anything.
 */

import type { Showing, ShowingState } from "../api/types";

export const STATE_LABELS: Record<ShowingState, string> = {
  AVAILABLE: "Available",
  REQUESTED: "Request received",
  RESIDENT_ACCEPTED: "Accepted by resident",
  BROKER_GATE: "Awaiting broker",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "Showing in progress",
  COMPLETED: "Completed",
  OUTCOME: "Closed",
};

/** Newest first. */
export function sortByNewest<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function mineAs(showings: Showing[], userId: string, field: "residentUserId" | "prospectUserId" | "brokerUserId"): Showing[] {
  return sortByNewest(showings.filter((s) => s[field] === userId));
}
