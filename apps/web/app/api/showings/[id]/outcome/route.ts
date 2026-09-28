import { NextRequest } from "next/server";
import { parseOutcomeBody, runShowingTransition } from "../../../../../lib/showing-api";

/** Prospect records the post-showing outcome. Body: { outcome: APPLY | WATCH | DECLINE, idempotencyKey? }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "RECORD_OUTCOME",
    roles: ["prospect"],
    parseBody: parseOutcomeBody,
  });
}
