import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";
import type { Showing } from "@inssnapp/engine";

/**
 * Live map data (Phase 8) — one call for the whole map.
 *
 * GET /api/map — polls every few seconds; no new paid services.
 * - Signed-out: public-safe subset (building locations + live unit counts;
 *   no addresses, no people) for the /m landing map.
 * - management: own org, full detail. inssnapp_admin: all orgs, full detail.
 */
const ACTIVE_STATES = ["REQUESTED", "RESIDENT_ACCEPTED", "BROKER_GATE", "CONFIRMED", "IN_PROGRESS"];

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  const publicView = !user;
  if (user && !isPrivileged(user.role)) return forbidden();

  const orgIds =
    !user || user.role === "inssnapp_admin"
      ? (await db.orgs.list()).map((o) => o.id)
      : [user.organizationId];
  const orgNames = new Map((await db.orgs.list()).map((o) => [o.id, o.name]));

  const properties: Array<{
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    organizationName: string;
    units: Array<{
      id: string;
      label: string;
      eligible: boolean;
      residentAvailable: boolean;
      activeShowing: {
        id: string;
        state: string;
        prospectName: string | null;
        brokerName: string | null;
      } | null;
    }>;
  }> = [];

  for (const orgId of orgIds) {
    const [props, units, showings] = await Promise.all([
      db.properties.byOrg(orgId),
      db.units.byOrg(orgId),
      db.showings.list(orgId) as Promise<Showing[]>,
    ]);
    const activeByUnit = new Map<string, Showing>();
    for (const s of showings) {
      if (ACTIVE_STATES.includes(s.state) && !activeByUnit.has(s.unitId)) {
        activeByUnit.set(s.unitId, s);
      }
    }
    // Batch-resolve names for active showings.
    const userIds = new Set<string>();
    for (const s of activeByUnit.values()) {
      if (s.prospectUserId) userIds.add(s.prospectUserId);
      if (s.brokerUserId) userIds.add(s.brokerUserId);
    }
    const names = new Map<string, string>();
    for (const uid of userIds) {
      const u = await db.users.byId(uid);
      if (u) names.set(uid, u.fullName);
    }

    for (const p of props) {
      const propUnits = units.filter((u) => u.propertyId === p.id);
      if (publicView) {
        // Public-safe: locations + live counts only.
        properties.push({
          id: p.id,
          name: p.name,
          address: "",
          latitude: p.latitude,
          longitude: p.longitude,
          organizationName: "",
          units: propUnits.map((u) => ({
            id: u.id,
            label: u.label,
            eligible: u.eligible,
            residentAvailable: u.residentAvailable,
            activeShowing: activeByUnit.has(u.id)
              ? { id: "active", state: "IN_PROGRESS", prospectName: null, brokerName: null }
              : null,
          })),
        });
        continue;
      }
      properties.push({
        id: p.id,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        organizationName: orgNames.get(p.organizationId) ?? "—",
        units: units
          .filter((u) => u.propertyId === p.id)
          .map((u) => {
            const s = activeByUnit.get(u.id) ?? null;
            return {
              id: u.id,
              label: u.label,
              eligible: u.eligible,
              residentAvailable: u.residentAvailable,
              activeShowing: s
                ? {
                    id: s.id,
                    state: s.state,
                    prospectName: s.prospectUserId ? (names.get(s.prospectUserId) ?? null) : null,
                    brokerName: s.brokerUserId ? (names.get(s.brokerUserId) ?? null) : null,
                  }
                : null,
            };
          }),
      });
    }
  }

  return NextResponse.json({ properties });
}
