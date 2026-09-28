import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

const ACTIVE_STATES = ["REQUESTED", "RESIDENT_ACCEPTED", "BROKER_GATE", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];

/**
 * Basic operational reports for the caller's organization.
 *
 * - funnel: showing counts per engine state
 * - transitions: total audit events (engine transitions)
 * - response: resident response-time stats derived from audit events —
 *   the delay between a showing being REQUESTED and the resident's first
 *   response (accept or decline). Showings still waiting on a resident
 *   response are counted as pending, never as zero-time.
 * - participation: enrolled residents vs currently available-now
 *
 * Privileged roles only (management, inssnapp_admin).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const [showings, events, residents, users] = await Promise.all([
    db.showings.list(user.organizationId),
    db.showingEvents.list(user.organizationId),
    db.residents.byOrgDetailed(user.organizationId),
    db.users.byOrg(user.organizationId),
  ]);

  // --- funnel ---
  const funnel: Record<string, number> = {};
  for (const s of showings) funnel[s.state] = (funnel[s.state] ?? 0) + 1;
  const active = showings.filter((s: { state: string }) =>
    ACTIVE_STATES.includes(s.state),
  ).length;

  // --- resident response times (seconds, REQUESTED -> first resident response) ---
  const requestedAt = new Map<string, number>();
  const respondedAt = new Map<string, number>();
  for (const e of events) {
    const at = new Date(e.at).getTime();
    if (e.toState === "REQUESTED" && !requestedAt.has(e.showingId)) {
      requestedAt.set(e.showingId, at);
    }
    if (
      e.fromState === "REQUESTED" &&
      (e.transition === "RESIDENT_ACCEPT" || e.transition === "RESIDENT_DECLINE") &&
      requestedAt.has(e.showingId) &&
      !respondedAt.has(e.showingId)
    ) {
      respondedAt.set(e.showingId, at);
    }
  }
  const deltas: number[] = [];
  let pendingResponses = 0;
  for (const [showingId, t0] of requestedAt) {
    const t1 = respondedAt.get(showingId);
    if (t1 === undefined) {
      pendingResponses += 1;
    } else {
      deltas.push(Math.max(0, (t1 - t0) / 1000));
    }
  }
  deltas.sort((a, b) => a - b);
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
  const median = deltas.length ? deltas[Math.floor((deltas.length - 1) / 2)] : null;

  // --- participation ---
  const residentUsers = users.filter((u: { role: string; id: string }) => u.role === "resident");
  const enrolledUserIds = new Set(residents.map((r: { userId: string }) => r.userId));
  const enrolled = residentUsers.filter((u: { id: string }) =>
    enrolledUserIds.has(u.id),
  ).length;
  const availableNow = residents.filter(
    (r: { eligible: boolean; residentAvailable: boolean }) =>
      r.eligible && r.residentAvailable,
  ).length;

  return NextResponse.json({
    funnel,
    totals: {
      showings: showings.length,
      activeShowings: active,
      transitions: events.length,
    },
    response: {
      responded: deltas.length,
      pending: pendingResponses,
      avgSeconds: avg,
      medianSeconds: median,
    },
    participation: {
      residentAccounts: residentUsers.length,
      enrolled,
      availableNow,
    },
  });
}
