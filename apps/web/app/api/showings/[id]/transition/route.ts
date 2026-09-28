import { NextRequest, NextResponse } from "next/server";
import { loadAuthedShowing, transitionStatus } from "../../../../../lib/showing-api";
import { engine } from "../../../../../lib/engine";
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

/**
 * Generic transition endpoint (kept for the existing desktop views).
 * Auth, tenant isolation, and the transition itself are shared with the
 * named routes in lib/showing-api.ts; the engine remains the sole
 * authority on state changes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadAuthedShowing(req, id);
  if (loaded.response) return loaded.response;
  const { user } = loaded.ctx;

  const body = (await req.json().catch(() => ({}))) as {
    transition?: Transition;
    idempotencyKey?: string;
    outcome?: ShowingOutcome;
    brokerUserId?: string;
  };
  const { transition } = body;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey
      ? body.idempotencyKey
      : crypto.randomUUID();

  if (!transition || !VALID_TRANSITIONS.includes(transition)) {
    return NextResponse.json({ error: "Unknown transition." }, { status: 400 });
  }

  const result = await engine.transition({
    showingId: id,
    transition,
    actor: { userId: user.userId, role: user.role, organizationId: user.organizationId },
    idempotencyKey,
    outcome: body.outcome,
    brokerUserId: body.brokerUserId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: transitionStatus(result.code) },
    );
  }

  return NextResponse.json({
    showing: result.showing,
    event: result.event,
    replayed: result.replayed,
  });
}
