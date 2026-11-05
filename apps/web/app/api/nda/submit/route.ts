import { NextResponse, after } from "next/server";
// Plain-JS core (framework-free so the Node check suites exercise the
// exact shipped code); types via lib/nda-submit-core.d.ts.
import { handleNdaSubmit } from "@/lib/nda-submit-core";
import { recordNdaSigning } from "@/lib/nda-signings";

/* INSNAPP website NDA submission endpoint (thin adapter).
   All logic lives in lib/nda-submit-core.js:
   validate → record FIRST (nda_signing_records, via
   lib/nda-signings.ts — a failed insert fails the submission
   loudly; the record is the verification for provisioning) → the
   Demo Portal provisioning trigger runs after the response via
   after() and can never fail the completed signing.

   Public endpoint: the caller is an anonymous website visitor signing
   on /legal/cnda — so the route is validated and rate-limited
   instead of authenticated. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory per-IP rate limit: 10 submissions/hour. Each serverless
// instance holds its own map — coarse, but this is a low-volume,
// human-driven flow and the cap applies per instance.
const hits = new Map<string, number[]>();
const WINDOW_MS = 3_600_000;
const MAX_PER_WINDOW = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const times = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) return true;
  times.push(now);
  hits.set(ip, times);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v[v.length - 1] < now - WINDOW_MS) hits.delete(k);
    }
  }
  return false;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { status, json } = await handleNdaSubmit({
    method: "POST",
    body,
    env: process.env,
    ip,
    userAgent: request.headers.get("user-agent") ?? "",
    recordImpl: recordNdaSigning,
    afterImpl: (fn) => {
      after(async () => {
        await fn();
      });
    },
  });
  return NextResponse.json(json, { status });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
