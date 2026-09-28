import { NextRequest } from "next/server";
import { parseBrokerAssignBody, runShowingTransition } from "../../../../../../lib/showing-api";

/** Management assigns a broker (broker gate). Body: { brokerUserId, idempotencyKey? }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "BROKER_ASSIGN",
    roles: ["management", "inssnapp_admin"],
    parseBody: parseBrokerAssignBody,
  });
}
