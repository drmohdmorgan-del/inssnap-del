import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { getScreeningService } from "../../../../lib/screening";
import {
  ScreeningConsentRequiredError,
  ScreeningProductionBlockedError,
  type ScreeningFixture,
} from "@inssnapp/integrations";
import { isPrivileged } from "@inssnapp/auth";
import { db } from "../../../../lib/db";
import {
  checkRateLimit,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../lib/rate-limit";

/**
 * Create a screening request (TASK-009).
 *
 * POST { prospectUserId, fixture? } — privileged roles only
 * (management, inssnapp_admin). FAIL-CLOSED:
 *   - 409 when no consent record exists for the org+prospect
 *     (ScreeningConsentRequiredError),
 *   - 409 when production is gated but only a sandbox adapter is
 *     registered (ScreeningProductionBlockedError).
 *
 * The sandbox adapter returns a deterministic fixture (clear / review /
 * consider; default clear). NO real screening API is called — the only
 * registered adapter is the mocked one.
 */
const FIXTURES: ScreeningFixture[] = ["clear", "review", "consider"];

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  // TASK-010: per-user throttle on screening requests (abuse protection).
  const limits = rateLimitPresets();
  const rl = checkRateLimit(`screening:${user.userId}`, limits.screeningPerUser);
  if (!rl.allowed) return rateLimitExceeded(rl.retryAfterSeconds);

  let body: { prospectUserId?: string; fixture?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prospectUserId = body.prospectUserId;
  if (!prospectUserId) {
    return NextResponse.json({ error: "prospectUserId is required" }, { status: 400 });
  }

  const prospect = await db.users.byId(prospectUserId);
  if (!prospect || prospect.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Prospect not found in this organization" }, { status: 404 });
  }

  if (body.fixture !== undefined && !FIXTURES.includes(body.fixture as ScreeningFixture)) {
    return NextResponse.json(
      { error: `fixture must be one of: ${FIXTURES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const report = await getScreeningService().requestScreening({
      organizationId: user.organizationId,
      prospectUserId,
      prospectName: prospect.fullName,
      fixture: body.fixture as ScreeningFixture | undefined,
      requestedBy: user.userId,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof ScreeningConsentRequiredError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    if (err instanceof ScreeningProductionBlockedError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 },
      );
    }
    throw err;
  }
}
