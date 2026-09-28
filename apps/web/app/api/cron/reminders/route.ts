import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { notifyShowingReminder } from "../../../../lib/notifications";

/**
 * Showing reminder cron — TASK-010.
 *
 * Triggered by Vercel Cron (see vercel.json `crons`) once a day. Finds
 * CONFIRMED showings whose last state change is older than
 * REMINDER_AFTER_HOURS (default 24), sends the `showing.reminder`
 * notification to the prospect and resident, and records the send so each
 * showing is reminded at most once.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. When
 * CRON_SECRET is unset the route refuses to run in production (fail
 * closed); in non-production it runs so local dev and tests can exercise
 * it.
 *
 * Honest limitation (see docs/RELEASE_AUDIT.md): showings carry no
 * scheduled date/time in the current domain model, so this is a
 * "stale-CONFIRMED nudge", not a true pre-showing reminder. A future
 * `scheduledAt` field would make it a real upcoming-showing reminder.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret) {
    if (!provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed: an unprotected cron endpoint in production would let
    // anyone trigger (and re-trigger) notifications.
    console.error("[inssnapp] /api/cron/reminders called in production without CRON_SECRET — refusing.");
    return NextResponse.json(
      { error: "Cron secret is not configured." },
      { status: 500 },
    );
  }

  const afterHoursRaw = process.env.REMINDER_AFTER_HOURS;
  const afterHours = afterHoursRaw ? Math.max(1, parseInt(afterHoursRaw, 10) || 24) : 24;
  const cutoffIso = new Date(Date.now() - afterHours * 3_600_000).toISOString();

  const candidates = await db.showings.listConfirmedStale(cutoffIso);
  let sent = 0;
  const errors: Array<{ showingId: string; error: string }> = [];
  for (const showing of candidates) {
    try {
      // notifyShowingReminder is fail-open (never throws), so a provider
      // failure here only surfaces as a logged delivery failure.
      await notifyShowingReminder(showing);
      await db.reminders.markSent(showing.id);
      sent += 1;
    } catch (err) {
      // Defensive: the ledger write must never kill the whole run.
      errors.push({
        showingId: showing.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    candidates: candidates.length,
    sent,
    errors,
  });
}
