import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";
import type { Showing } from "@inssnapp/engine";

/**
 * Privacy-safe prospect profile (Phase 4).
 *
 * GET /api/prospects/[id]/profile
 *
 * A resident may view the profile of a prospect they share a showing with
 * (to decide accept/decline); management may view any prospect in the org.
 * Returns only non-sensitive facts: name, verification status, showing
 * history stats, and ratings RECEIVED (averages + comments, no rater
 * identities). No email, no contact details.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const { id } = await params;

  const target = await db.users.byId(id);
  if (!target || target.organizationId !== user.organizationId || target.role !== "prospect") {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  if (!isPrivileged(user.role) && user.role !== "resident") return forbidden();

  const showings: Showing[] = await db.showings.list(user.organizationId);

  if (!isPrivileged(user.role)) {
    // Residents: only prospects they share at least one showing with.
    const shared = showings.some(
      (s: Showing) => s.prospectUserId === id && s.residentUserId === user.userId,
    );
    if (!shared) return forbidden();
  }

  const mine = showings.filter((s: Showing) => s.prospectUserId === id);
  const outcomes = { APPLY: 0, WATCH: 0, DECLINE: 0 };
  for (const s of mine) {
    if (s.outcome && s.outcome in outcomes) outcomes[s.outcome as keyof typeof outcomes] += 1;
  }

  // Ratings received = ratings on this prospect's showings left by others.
  const received: { stars: number; comment: string | null; at: string }[] = [];
  for (const s of mine) {
    const ratings = await db.ratings.byShowing(s.id);
    for (const r of ratings) {
      if (r.raterUserId !== id) {
        received.push({ stars: r.stars, comment: r.comment, at: r.createdAt });
      }
    }
  }
  received.sort((a, b) => (a.at < b.at ? 1 : -1));
  const avg =
    received.length > 0
      ? Math.round((received.reduce((sum, r) => sum + r.stars, 0) / received.length) * 10) / 10
      : null;

  return NextResponse.json({
    profile: {
      fullName: target.fullName,
      emailVerified: target.emailVerified,
      stats: {
        totalShowings: mine.length,
        completedShowings: mine.filter((s) => s.state === "COMPLETED" || s.state === "OUTCOME").length,
        outcomes,
      },
      ratingsReceived: {
        count: received.length,
        avgStars: avg,
        recent: received.slice(0, 5),
      },
    },
  });
}
