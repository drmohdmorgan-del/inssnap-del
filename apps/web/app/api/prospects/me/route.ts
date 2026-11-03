import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import type { ProspectDocumentRecord } from "../../../../lib/store";
import {
  PROSPECTIVE_TIERS,
  REQUIRED_DOCUMENT_TYPES,
  computePacketReadiness,
} from "../../../../lib/prospective-tiers";

/**
 * Prospective application profile + tier (2026-11-03).
 *
 * GET  /api/prospects/me — own application profile, tier, and packet
 *   readiness (which parts of the pre-assembled packet are done).
 * POST /api/prospects/me — update application fields, record documents,
 *   and select a tier. Body (all optional):
 *     { tier, moveInDate, occupants, hasPets, employmentStatus,
 *       incomeRange, statement, documents: ["government_id", ...] }
 *   Tier selection is free during the pilot — no payment provider is
 *   connected yet; the Ready price lives in config
 *   (lib/prospective-tiers.ts) for when payments are wired.
 *
 * Readiness is a SPEED state (packet pre-assembled), never an approval:
 * Management vets and decides every file.
 */
async function view(userId: string, organizationId: string) {
  const profile = await db.prospectProfiles.getOrCreate(userId, organizationId);
  const latest = await db.screening.latestReportForProspect(organizationId, userId);
  const readiness = computePacketReadiness(profile, latest);
  return {
    tier: profile.tier,
    tiers: PROSPECTIVE_TIERS,
    paymentsNote:
      "Tier selection is free during the pilot — no payment provider is connected yet.",
    application: {
      moveInDate: profile.moveInDate,
      occupants: profile.occupants,
      hasPets: profile.hasPets,
      employmentStatus: profile.employmentStatus,
      incomeRange: profile.incomeRange,
      statement: profile.statement,
    },
    documents: profile.documents,
    requiredDocumentTypes: REQUIRED_DOCUMENT_TYPES,
    readiness,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "prospect") return forbidden();
  return NextResponse.json(await view(user.userId, user.organizationId));
}

const DOC_TYPES = new Set<string>(REQUIRED_DOCUMENT_TYPES);

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "prospect") return forbidden();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof db.prospectProfiles.update>[2] = {};

  if (body.tier !== undefined) {
    if (body.tier !== "base" && body.tier !== "ready") {
      return NextResponse.json({ error: "tier must be base or ready." }, { status: 400 });
    }
    patch.tier = body.tier;
  }
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) || null : undefined;
  const moveInDate = str(body.moveInDate, 32);
  if (moveInDate !== undefined) patch.moveInDate = moveInDate;
  const employmentStatus = str(body.employmentStatus, 120);
  if (employmentStatus !== undefined) patch.employmentStatus = employmentStatus;
  const incomeRange = str(body.incomeRange, 64);
  if (incomeRange !== undefined) patch.incomeRange = incomeRange;
  const statement = str(body.statement, 2000);
  if (statement !== undefined) patch.statement = statement;
  if (body.occupants !== undefined) {
    if (typeof body.occupants !== "number" || body.occupants < 1 || body.occupants > 20) {
      return NextResponse.json(
        { error: "occupants must be a number between 1 and 20." },
        { status: 400 },
      );
    }
    patch.occupants = Math.floor(body.occupants);
  }
  if (body.hasPets !== undefined) {
    if (typeof body.hasPets !== "boolean") {
      return NextResponse.json({ error: "hasPets must be a boolean." }, { status: 400 });
    }
    patch.hasPets = body.hasPets;
  }
  if (body.documents !== undefined) {
    if (!Array.isArray(body.documents) || body.documents.some((d) => !DOC_TYPES.has(d as string))) {
      return NextResponse.json(
        { error: `documents must be a subset of: ${REQUIRED_DOCUMENT_TYPES.join(", ")}.` },
        { status: 400 },
      );
    }
    const current = await db.prospectProfiles.getOrCreate(user.userId, user.organizationId);
    const prior: Map<string, string> = new Map(current.documents.map((d) => [d.type, d.recordedAt]));
    const now = new Date().toISOString();
    patch.documents = (body.documents as string[]).map((type) => ({
      type: type as ProspectDocumentRecord["type"],
      recordedAt: prior.get(type) ?? now,
    }));
  }

  await db.prospectProfiles.update(user.userId, user.organizationId, patch);
  return NextResponse.json(await view(user.userId, user.organizationId));
}
