import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";
import type { Showing } from "@inssnapp/engine";
import { computePacketReadiness } from "../../../../../lib/prospective-tiers";

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

  // Ready packet (2026-11-03) — PRIVILEGED viewers only (Management
  // vets the complete file). packetAssembled means the prospective's
  // packet is pre-assembled (screening done, financials/documents
  // loaded, application complete); it is NOT an approval — Management
  // still decides every application. Residents never see this block:
  // it carries financial/application detail.
  let readyPacket: Record<string, unknown> | null = null;
  if (isPrivileged(user.role)) {
    const appProfile = await db.prospectProfiles.getOrCreate(id, user.organizationId);
    const latest = await db.screening.latestReportForProspect(user.organizationId, id);
    const readiness = computePacketReadiness(appProfile, latest);
    readyPacket = {
      tier: appProfile.tier,
      ...readiness,
      // Credential review (DrMorgan 2026-11-03): Management decides from
      // VERIFIED SOURCES, never from applicant-uploaded documents or an
      // assembled workflow document. Each credential below names its
      // source and verification state; applicant-provided material is a
      // record of the case, not evidence for the decision.
      verification: [
        {
          credential: "Background screening",
          source: latest ? `Checkr (${latest.mode})` : "Checkr",
          state: latest ? latest.status : "not run",
        },
        {
          credential: "Income / employment",
          source: "Applicant-stated — no verified-income source connected yet",
          state: "unverified",
        },
        {
          credential: "Documents",
          source: "Applicant-provided records — case record only, not evidence",
          state: readiness.documentsLoaded ? "on record" : "missing",
        },
      ],
      application: {
        moveInDate: appProfile.moveInDate,
        occupants: appProfile.occupants,
        hasPets: appProfile.hasPets,
        employmentStatus: appProfile.employmentStatus,
        incomeRange: appProfile.incomeRange,
        statement: appProfile.statement,
      },
      documents: appProfile.documents,
    };
  }

  return NextResponse.json({
    readyPacket,
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
