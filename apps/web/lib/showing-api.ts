/**
 * Shared helpers for the Showing Engine API routes (TASK-003).
 *
 * Every route here is a thin adapter: authentication, tenant isolation
 * (cross-org reads return 404 so records cannot be probed), and input
 * validation happen at the boundary; the state transition itself is always
 * delegated to the Authoritative Showing Engine, which remains the sole
 * authority permitted to change showing state. Routes never invent their
 * own transition rules.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Role, ShowingOutcome, Transition } from "@inssnapp/engine";
import type { SessionUser } from "@inssnapp/auth";
import { getSessionUser, unauthorized, forbidden } from "./auth-helpers";
import { getAuthStore } from "./auth-store";
import { engine } from "./engine";
import { db } from "./db";

/** Maps engine result codes to HTTP statuses. */
export function transitionStatus(code: string): number {
  switch (code) {
    case "NOT_FOUND":
    case "TENANT_ISOLATION":
      return 404;
    case "ROLE_FORBIDDEN":
      return 403;
    case "CONCURRENCY_CONFLICT":
    case "UNIT_LOCKED":
      return 409;
    case "VALIDATION":
    case "ILLEGAL_TRANSITION":
    default:
      return 400;
  }
}

export interface AuthedShowing {
  user: SessionUser;
  showing: Awaited<ReturnType<typeof db.showings.get>>;
}

/**
 * Resolves the session user and the showing, enforcing tenant isolation.
 * Returns a NextResponse (error) or the authed context.
 */
export async function loadAuthedShowing(
  req: NextRequest,
  id: string,
): Promise<{ response: NextResponse } | { response: null; ctx: AuthedShowing }> {
  const user = await getSessionUser(req);
  if (!user) return { response: unauthorized() };

  const showing = await db.showings.get(id);
  // 404 — not 403 — so callers cannot probe other organizations' records.
  if (!showing || showing.organizationId !== user.organizationId) {
    return { response: NextResponse.json({ error: "Showing not found." }, { status: 404 }) };
  }
  return { response: null, ctx: { user, showing } };
}

export interface TransitionOptions {
  transition: Transition;
  /** Route-level role gate (defense in depth; the engine re-enforces). */
  roles: Role[];
  /** Validates the request body; returns extra engine params or an error response. */
  parseBody?: (body: Record<string, unknown>, user: SessionUser) => Promise<
    | { ok: true; outcome?: ShowingOutcome; brokerUserId?: string; idempotencyKey?: string }
    | { ok: false; response: NextResponse }
  >;
}

/**
 * Runs one named showing transition end-to-end: auth, tenant isolation,
 * role gate, body validation, engine delegation, status mapping.
 */
export async function runShowingTransition(
  req: NextRequest,
  id: string,
  opts: TransitionOptions,
): Promise<NextResponse> {
  const loaded = await loadAuthedShowing(req, id);
  if (loaded.response) return loaded.response;
  const { user } = loaded.ctx;

  if (!opts.roles.includes(user.role)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let outcome: ShowingOutcome | undefined;
  let brokerUserId: string | undefined;
  let idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey
    ? body.idempotencyKey
    : crypto.randomUUID();

  if (opts.parseBody) {
    const parsed = await opts.parseBody(body, user);
    if (!parsed.ok) return parsed.response;
    outcome = parsed.outcome;
    brokerUserId = parsed.brokerUserId;
    if (parsed.idempotencyKey) idempotencyKey = parsed.idempotencyKey;
  }

  const result = await engine.transition({
    showingId: id,
    transition: opts.transition,
    actor: { userId: user.userId, role: user.role, organizationId: user.organizationId },
    idempotencyKey,
    outcome,
    brokerUserId,
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

/** Validates RECORD_OUTCOME's outcome parameter. */
export async function parseOutcomeBody(body: Record<string, unknown>) {
  const outcome = body.outcome as string | undefined;
  if (outcome !== "APPLY" && outcome !== "WATCH" && outcome !== "DECLINE") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "outcome must be one of APPLY, WATCH, DECLINE." },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const, outcome: outcome as ShowingOutcome };
}

/** Validates BROKER_ASSIGN's brokerUserId: the user must exist in the caller's org and hold the broker role. */
export async function parseBrokerAssignBody(body: Record<string, unknown>, user: SessionUser) {
  const brokerUserId = body.brokerUserId as string | undefined;
  if (!brokerUserId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "brokerUserId is required." }, { status: 400 }),
    };
  }
  const broker = await getAuthStore().getUserById(brokerUserId);
  if (!broker || broker.organizationId !== user.organizationId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Broker not found in your organization." },
        { status: 404 },
      ),
    };
  }
  if (broker.role !== "broker") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Assigned user does not hold the broker role." },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const, brokerUserId };
}
