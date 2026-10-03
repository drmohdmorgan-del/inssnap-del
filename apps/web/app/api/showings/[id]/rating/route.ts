import { NextRequest, NextResponse } from "next/server";
import { loadAuthedShowing } from "../../../../../lib/showing-api";
import { forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";

/**
 * Post-completion showing rating (Phase 5: resident, broker AND prospect).
 *
 * Body: { stars: 1–5, comment?: string (≤500 chars) }.
 *
 * Ratings are participant feedback only — they never change showing
 * state (the engine remains the sole authority on transitions). Only a
 * participant of the showing (its resident, broker, or prospect) may rate,
 * and only once the showing is COMPLETED (or has a recorded OUTCOME). One
 * rating per rater per showing; a repeat submission fails with 409.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadAuthedShowing(req, id);
  if (loaded.response) return loaded.response;
  const { user, showing } = loaded.ctx;

  // Phase 5: the prospect rates the visit (the current tenant); the
  // resident/broker rate as before. Participant-only.
  const isParticipant =
    (user.role === "resident" && showing.residentUserId === user.userId) ||
    (user.role === "broker" && showing.brokerUserId === user.userId) ||
    (user.role === "prospect" && showing.prospectUserId === user.userId);
  if (!isParticipant) return forbidden();
  if (showing.state !== "COMPLETED" && showing.state !== "OUTCOME") {
    return NextResponse.json(
      { error: "The showing must be completed before it can be rated." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    stars?: unknown;
    comment?: unknown;
  };
  const { stars, comment } = body;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "stars must be an integer from 1 to 5." }, { status: 400 });
  }
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string" || comment.length > 500) {
      return NextResponse.json({ error: "comment must be at most 500 chars." }, { status: 400 });
    }
  }

  const existing = await db.ratings.byShowing(showing.id);
  if (existing.some((r) => r.raterUserId === user.userId)) {
    return NextResponse.json(
      { error: "You have already rated this showing." },
      { status: 409 },
    );
  }

  try {
    const rating = await db.ratings.insert({
      organizationId: showing.organizationId,
      showingId: showing.id,
      raterUserId: user.userId,
      raterRole: user.role,
      stars,
      comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
    });
    return NextResponse.json({ rating }, { status: 201 });
  } catch (err) {
    // Postgres UNIQUE(showing_id, rater_user_id) race: the in-memory
    // precheck above is the primary guard; this is the fail-closed net.
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json(
        { error: "You have already rated this showing." },
        { status: 409 },
      );
    }
    throw err;
  }
}
