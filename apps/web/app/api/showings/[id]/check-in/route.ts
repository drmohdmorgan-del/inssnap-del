import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../lib/showing-api";

/** Broker or resident checks in — the showing is in progress. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "CHECK_IN",
    roles: ["broker", "resident"],
  });
}
