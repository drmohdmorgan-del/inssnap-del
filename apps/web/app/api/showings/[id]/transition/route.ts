import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "../../../../../lib/auth-helpers";
import { engine } from "../../../../../lib/engine";
import { db } from "../../../../../lib/db";
import type { ShowingOutcome, Transition } from "@inssnapp/engine";

const VALID_TRANSITIONS: Transition[] = [
  "PROSPECT_REQUEST",
  "RESIDENT_ACCEPT",
  "RESIDENT_DECLINE",
  "BROKER_ASSIGN",
  "BROKER_ACCEPT",
  "BROKER_DECLINE",
  "CONFIRM",
  "CHECK_IN",
  "COMPLETE",
  "RECORD_OUTCOME",
  "EXPIRE",
];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const showing = await db.showings.get(id);
  if (!showing) {
    return NextResponse.json({ error: "Showing not found." }, { status: 404 });
  }
  // Tenant isolation at the API boundary (the engine enforces it too).
  // 404 — not 403 — so callers cannot probe other organizations' records.
  if (showing.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Showing not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const transition = body.transition as Transition;
  const idempotencyKey = (body.idempotencyKey as string) || crypto.randomUUID();
  const outcome = body.outcome as ShowingOutcome | undefined;
  const brokerUserId = body.brokerUserId as string | undefined;

  if (!VALID_TRANSITIONS.includes(transition)) {
    return NextResponse.json({ error: "Unknown transition." }, { status: 400 });
  }

  const result = await engine.transition({
    showingId: id,
    transition,
    actor: { userId: user.userId, role: user.role, organizationId: user.organizationId },
    idempotencyKey,
    outcome,
    brokerUserId,
  });

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "TENANT_ISOLATION" || result.code === "ROLE_FORBIDDEN"
        ? 403
        : result.code === "CONCURRENCY_CONFLICT"
        ? 409
        : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ showing: result.showing, event: result.event, replayed: result.replayed });
}
