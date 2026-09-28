import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../../lib/showing-api";

/** Resident accepts an incoming showing request. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "RESIDENT_ACCEPT",
    roles: ["resident"],
  });
}
