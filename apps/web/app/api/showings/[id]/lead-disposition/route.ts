import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db, type LeadDisposition } from "../../../../../lib/db";

/**
 * Direct a lead (Phase 6) — privileged only (management, inssnapp_admin).
 *
 * POST /api/showings/[id]/lead-disposition  { disposition }
 *   disposition: "pending" | "inhouse" | "management"
 *
 * - "inhouse": keep in-house — the prospect works directly with the
 *   resident/management; no broker assignment.
 * - "management": push to management's lead pool (visible in /admin Leads;
 *   management may assign a broker from there).
 *
 * Disposition is web-side metadata, NOT engine state — the engine remains
 * the sole authority on showing states. Only meaningful for OUTCOME
 * showings (the lead pool). inssnapp_admin may direct leads in any
 * organization (Control Center); management only in their own.
 */
const DISPOSITIONS: LeadDisposition[] = ["pending", "inhouse", "management"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "management" && user.role !== "inssnapp_admin") return forbidden();

  const { id } = await params;
  const showing = await db.showings.get(id);
  // 404 — not 403 — so callers cannot probe other organizations' records.
  if (!showing) {
    return NextResponse.json({ error: "Showing not found." }, { status: 404 });
  }
  if (user.role === "management" && showing.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Showing not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { disposition?: unknown };
  if (!DISPOSITIONS.includes(body.disposition as LeadDisposition)) {
    return NextResponse.json(
      { error: "disposition must be pending, inhouse or management." },
      { status: 400 },
    );
  }

  const record = await db.leadDispositions.set(
    showing.id,
    showing.organizationId,
    body.disposition as LeadDisposition,
    user.userId,
  );
  return NextResponse.json({ disposition: record });
}
