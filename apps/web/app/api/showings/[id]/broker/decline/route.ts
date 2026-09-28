import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../../lib/showing-api";

/** Broker declines the assignment (broker gate). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "BROKER_DECLINE",
    roles: ["broker"],
  });
}
