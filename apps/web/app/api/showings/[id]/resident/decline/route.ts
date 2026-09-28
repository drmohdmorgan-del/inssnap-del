import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../../lib/showing-api";

/** Resident declines an incoming showing request. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "RESIDENT_DECLINE",
    roles: ["resident"],
  });
}
