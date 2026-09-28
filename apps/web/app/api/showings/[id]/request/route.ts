import { NextRequest } from "next/server";
import { runShowingTransition } from "../../../../../lib/showing-api";

/** Prospect requests an existing AVAILABLE showing. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runShowingTransition(req, id, {
    transition: "PROSPECT_REQUEST",
    roles: ["prospect"],
  });
}
