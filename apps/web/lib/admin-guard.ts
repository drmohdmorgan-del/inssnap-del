import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "@inssnapp/auth";
import { getSessionUser, unauthorized, forbidden } from "./auth-helpers";

/**
 * Control Center guard: every /api/control/* route requires the
 * inssnapp_admin role. Management has its own /admin desktop; the Control
 * Center is the platform super-admin surface (cross-organization).
 */
export async function requireAdmin(
  req: NextRequest,
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSessionUser(req);
  if (!user) return { error: unauthorized() };
  if (user.role !== "inssnapp_admin") return { error: forbidden() };
  return { user };
}
