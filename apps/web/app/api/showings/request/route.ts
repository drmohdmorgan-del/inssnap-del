import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { engine } from "../../../../lib/engine";
import { db } from "../../../../lib/db";
import { notifyShowingTransition } from "../../../../lib/notifications";
import { transitionStatus } from "../../../../lib/showing-api";

/**
 * Prospect creates a showing request for a unit — TASK-003.
 *
 * Scope §2: a prospect may only request a unit that is eligible and has
 * resident availability active. The route creates the AVAILABLE showing
 * (linked to the unit's verified resident) and immediately delegates the
 * PROSPECT_REQUEST transition to the Showing Engine. Caller-supplied
 * idempotency keys make retries safe: a repeated key replays the original
 * request without creating a duplicate showing.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "prospect") return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    unitId?: string;
    idempotencyKey?: string;
  };
  const { unitId } = body;
  if (!unitId) {
    return NextResponse.json({ error: "unitId is required." }, { status: 400 });
  }

  const unit = await db.units.byId(unitId);
  if (!unit || unit.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Unit not found in your organization." }, { status: 404 });
  }
  if (!unit.eligible || !unit.residentAvailable) {
    return NextResponse.json(
      { error: "Unit is not available for showing requests." },
      { status: 400 },
    );
  }

  const resident = await db.residents.byUnit(unitId);
  if (!resident) {
    return NextResponse.json(
      { error: "No verified resident is linked to this unit." },
      { status: 400 },
    );
  }

  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey
      ? body.idempotencyKey
      : crypto.randomUUID();

  // Idempotent retry: the key already produced a request — replay it.
  const prior = await db.showingEvents.findByIdempotencyKey(idempotencyKey);
  if (prior) {
    const showing = await db.showings.get(prior.showingId);
    if (showing && showing.organizationId === user.organizationId) {
      return NextResponse.json({ showing, event: prior, replayed: true });
    }
  }

  const showing = await db.showings.create(
    unitId,
    resident.userId,
    user.organizationId,
    false,
  );

  // Replays the result recorded under our idempotency key — the winner of a
  // concurrent duplicate create — when it is visible in our organization.
  const replayWinner = async () => {
    const winner = await db.showingEvents.findByIdempotencyKey(idempotencyKey);
    if (!winner) return null;
    const winnerShowing = await db.showings.get(winner.showingId);
    if (!winnerShowing || winnerShowing.organizationId !== user.organizationId) return null;
    return NextResponse.json({ showing: winnerShowing, event: winner, replayed: true });
  };

  let result: Awaited<ReturnType<typeof engine.transition>>;
  try {
    result = await engine.transition({
      showingId: showing.id,
      transition: "PROSPECT_REQUEST",
      actor: { userId: user.userId, role: user.role, organizationId: user.organizationId },
      idempotencyKey,
    });
  } catch (err) {
    // True-concurrency race: two requests with the same key both passed the
    // precheck above; the loser's event INSERT hit the
    // UNIQUE (organization_id, idempotency_key) constraint. Replay the winner.
    if ((err as { code?: string })?.code === "23505") {
      const replayed = await replayWinner();
      if (replayed) return replayed;
    }
    throw err;
  }

  if (!result.ok && result.code === "VALIDATION") {
    // Concurrent duplicate create: the engine saw our reused key (written by
    // the winner) before inserting any event, so our showing is an orphan
    // with no audit trail to preserve — remove it and replay the winner, so
    // concurrent retries stay perfectly idempotent.
    const hasEvents = (await db.showingEvents.list(user.organizationId)).some(
      (e: { showingId: string }) => e.showingId === showing.id,
    );
    if (!hasEvents) {
      await db.showings.remove(showing.id);
      const replayed = await replayWinner();
      if (replayed) return replayed;
    }
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: transitionStatus(result.code) },
    );
  }

  // Notification side effect (TASK-008): "request received" via the
  // NotificationAdapter interface, fail-open — a provider failure is logged
  // and never breaks the already-committed transition.
  await notifyShowingTransition("PROSPECT_REQUEST", result.showing, user.role);

  return NextResponse.json(
    { showing: result.showing, event: result.event, replayed: false },
    { status: 201 },
  );
}
