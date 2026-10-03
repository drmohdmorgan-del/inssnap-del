import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import { BROKER_TIERS, brokerUsage, isBrokerTierId } from "../../../../../lib/broker-tiers";

/**
 * Broker subscription tier (Phase 7) — the broker's own profile.
 *
 * GET  /api/brokers/me/tier — current tier + lead usage vs limit.
 * POST /api/brokers/me/tier { tier: "trial" | "basic" | "pro" }
 *   Free self-serve selection in the pilot — NO payment provider is wired
 *   (left for DrMorgan's choice). Switching tiers resets the window.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "broker") return forbidden();

  const usage = await brokerUsage(db, user.organizationId, user.userId);
  return NextResponse.json({
    tier: usage.tier,
    tierStartedAt: usage.tierStartedAt,
    trialEndsAt: usage.trialEndsAt,
    trialExpired: usage.trialExpired,
    used: usage.used,
    limit: usage.limit,
    canAcceptMore: usage.canAcceptMore,
    tiers: BROKER_TIERS,
    paymentsNote:
      "Tier selection is free during the pilot — no payment provider is connected yet.",
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "broker") return forbidden();

  const body = (await req.json().catch(() => ({}))) as { tier?: unknown };
  if (!isBrokerTierId(body.tier)) {
    return NextResponse.json(
      { error: "tier must be trial, basic or pro." },
      { status: 400 },
    );
  }

  const profile = await db.brokerProfiles.setTier(user.userId, user.organizationId, body.tier);
  const usage = await brokerUsage(db, user.organizationId, user.userId);
  return NextResponse.json({
    tier: profile.tier,
    tierStartedAt: profile.tierStartedAt,
    trialEndsAt: profile.trialEndsAt,
    used: usage.used,
    limit: usage.limit,
    canAcceptMore: usage.canAcceptMore,
  });
}
