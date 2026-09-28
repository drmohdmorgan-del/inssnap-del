/**
 * In-memory rate limiter — TASK-010.
 *
 * Fixed-window counters keyed per (endpoint, identifier), stored in module
 * state. Per-instance only: on Vercel each serverless instance keeps its own
 * counters, which is acceptable for brute-force/login-abuse protection
 * (an attacker would have to spread attempts across instances, each of which
 * still throttles them). The PostgreSQL path is authoritative for business
 * state; rate limiting is deliberately not business state.
 *
 * Limits are tunable per deployment via environment variables
 * (INSSNAPP_RL_LOGIN_MAX, INSSNAPP_RL_MFA_MAX, INSSNAPP_RL_SHOWING_MAX);
 * tests use these to exercise the 429 path without hammering argon2.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Effective limits, resolved per call so tests can override via env. */
export function rateLimitPresets() {
  return {
    /** Login attempts: per account + per IP. */
    loginPerAccount: { windowMs: 15 * 60_000, max: numEnv("INSSNAPP_RL_LOGIN_MAX", 20) },
    loginPerIp: { windowMs: 15 * 60_000, max: numEnv("INSSNAPP_RL_LOGIN_IP_MAX", 60) },
    /** MFA code attempts: per IP. */
    mfaPerIp: { windowMs: 15 * 60_000, max: numEnv("INSSNAPP_RL_MFA_MAX", 10) },
    /** Showing mutations: per authenticated user. */
    showingWritePerUser: { windowMs: 60_000, max: numEnv("INSSNAPP_RL_SHOWING_MAX", 60) },
    /** Screening request (sandbox): per user. */
    screeningPerUser: { windowMs: 60_000, max: numEnv("INSSNAPP_RL_SCREENING_MAX", 30) },
  };
}

export interface RateLimitCheck {
  allowed: boolean;
  /** Seconds until the window resets (for the Retry-After header). */
  retryAfterSeconds: number;
}

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (now - b.windowStart >= windowMs) buckets.delete(key);
  }
}

/**
 * Records one hit against `key` and reports whether it is within budget.
 * Pure function of (key, opts) — easy to unit test.
 */
export function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
  now = Date.now(),
): RateLimitCheck {
  const { windowMs, max } = opts;
  sweep(now, windowMs);
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count <= max) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.windowStart + windowMs - now) / 1000),
  );
  return { allowed: false, retryAfterSeconds };
}

/** Test helper: clears all counters. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = Date.now();
}

/** Best-effort client identity: Vercel forwards the real IP here. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}

/** 429 response with a Retry-After header. */
export function rateLimitExceeded(retryAfterSeconds: number) {
  const res = NextResponse.json(
    { error: "Too many requests. Please slow down and try again.", code: "RATE_LIMITED" },
    { status: 429 },
  );
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}
