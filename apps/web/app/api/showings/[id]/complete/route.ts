import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../lib/showing-api";

/**
 * Broker or resident completes the showing. The engine releases the
 * unit/showing lock on COMPLETE, freeing the unit for future workflows
 * and enabling the prospect outcome step.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "COMPLETE",
    roles: ["broker", "resident"],
  });
}
