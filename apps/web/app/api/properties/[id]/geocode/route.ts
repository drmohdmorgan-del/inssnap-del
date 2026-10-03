import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Free geocoding for building registration (Phase 8).
 *
 * POST /api/properties/[id]/geocode — looks up the property's address via
 * OpenStreetMap Nominatim (free, no API key) and stores the coordinates.
 * Server-side with a proper User-Agent per Nominatim's usage policy.
 * Privileged roles only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const { id } = await params;
  const property = await db.properties.byId(id);
  if (!property || property.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const q = encodeURIComponent(property.address);
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      {
        headers: {
          "User-Agent": "INSSNAPP/1.0 (pilot; contact: info@inssnapp.com)",
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 502 });
    }
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (data[0]?.lat && data[0]?.lon) {
      lat = Number(data[0].lat);
      lng = Number(data[0].lon);
    }
  } catch {
    return NextResponse.json({ error: "Geocoding failed." }, { status: 502 });
  }

  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "No coordinates found for that address. Drop the pin manually." },
      { status: 404 },
    );
  }

  const updated = await db.properties.patch(id, { latitude: lat, longitude: lng });
  return NextResponse.json({ property: updated });
}
