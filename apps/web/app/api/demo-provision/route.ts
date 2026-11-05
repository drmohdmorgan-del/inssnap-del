import { NextResponse } from "next/server";
// Plain-JS core (framework-free so the Node check suites exercise the
// exact shipped code); types via the sibling .d.ts file.
import { handleDemoProvision } from "@/lib/demo-provision-core";

/* INSNAPP Demo Portal — provisioning endpoint (thin adapter).
   All logic lives in lib/demo-provision-core.js: secret-gated,
   fail-closed without DEMO_PROVISION_SECRET /
   DEMO_PROVISION_GITHUB_TOKEN, idempotent per signer, activation
   email via Resend. DORMANT-READY: no website CNDA trigger calls it
   yet — that wiring is a later step; never called by a browser. */
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
  const { status, json } = await handleDemoProvision({
    method: req.method,
    headers: { "x-demo-provision-secret": req.headers.get("x-demo-provision-secret") ?? "" },
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
