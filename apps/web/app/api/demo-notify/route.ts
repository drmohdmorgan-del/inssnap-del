import { NextResponse } from "next/server";
// Plain-JS core (framework-free so the Node check suites exercise the
// exact shipped code); types via lib/demo-notify-core.d.ts.
import { handleDemoNotify } from "@/lib/demo-notify-core";

/* INSNAPP Demo Portal — access notification + activity endpoint
   (thin adapter). All logic lives in lib/demo-notify-core.js:
   success events (activated / login) email DrMorgan with identity
   derived server-side from provisioning; EVERY valid event is
   forwarded server-side to the central IEC Office activity ingest,
   gated by DEMO_ACTIVITY_SECRET and fail-silent so the demo never
   breaks. Seed events forward flagged seed:true and never email. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<NextResponse> {
  let body: unknown = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  const { status, json } = await handleDemoNotify({
    method: req.method,
    body,
    env: process.env,
  });
  return NextResponse.json(json, { status });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
