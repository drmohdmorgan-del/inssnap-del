import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../lib/showing-api";

/**
 * Management confirms the showing. The engine acquires the exclusive
 * unit/showing lock on CONFIRM, preventing conflicting active workflows
 * (concurrent confirms for the same unit fail closed with 409).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "CONFIRM",
    roles: ["management", "inssnapp_admin"],
  });
}
