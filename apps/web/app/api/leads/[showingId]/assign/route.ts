import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";
import { getAuthStore } from "../../../../../lib/auth-store";

/**
 * F2 (2026-10-25): lead-pool broker assignment.
 *
 * POST /api/leads/[showingId]/assign { brokerUserId }
 *
 * The old LeadsPanel called the BROKER_ASSIGN engine transition here, which is
 * illegal from OUTCOME (a lead IS an OUTCOME showing) — every push failed with
 * ILLEGAL_TRANSITION. A lead assignment is follow-up metadata, not a workflow
 * transition: it is recorded on lead_dispositions and changes no engine state.
 * Privileged roles only; the showing and the broker must both belong to the
 * caller's organization (admins act within the showing's org), and the target
 * user must hold the broker role.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ showingId: string }> }) {
  const { showingId } = await params;
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const brokerUserId = (body as { brokerUserId?: unknown }).brokerUserId;
  if (typeof brokerUserId !== "string" || !brokerUserId) {
    return NextResponse.json({ error: "brokerUserId is required." }, { status: 400 });
  }

  const showing = await db.showings.get(showingId);
  if (!showing || showing.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Lead not found in your organization." }, { status: 404 });
  }
  if (showing.state !== "OUTCOME") {
    return NextResponse.json(
      { error: "Only decided (OUTCOME) showings are leads." },
      { status: 400 },
    );
  }

  const broker = await getAuthStore().getUserById(brokerUserId);
  if (!broker || broker.organizationId !== user.organizationId || broker.role !== "broker") {
    return NextResponse.json(
      { error: "Assigned user must be a broker in your organization." },
      { status: 400 },
    );
  }

  const record = await db.leadDispositions.assignBroker(
    showingId,
    user.organizationId,
    brokerUserId,
    user.userId,
  );
  return NextResponse.json({
    lead: {
      showingId,
      brokerUserId: record.brokerUserId,
      brokerName: broker.fullName,
      brokerAssignedAt: record.brokerAssignedAt,
    },
  });
}
