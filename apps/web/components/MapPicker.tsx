"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Pin-drop coordinate picker (Phase 8).
 * Click the map to place/move the pin; the chosen lat/lng flows back via
 * onPick. Leaflet + OpenStreetMap — free, no API key.
 */
export function MapPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const start: L.LatLngExpression =
      typeof latitude === "number" && typeof longitude === "number"
        ? [latitude, longitude]
        : [47.6062, -122.3321];
    const map = L.map(divRef.current).setView(start, typeof latitude === "number" ? 15 : 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const place = (lat: number, lng: number) => {
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current?.getLatLng();
          if (ll) pickRef.current(ll.lat, ll.lng);
        });
      }
    };
    if (typeof latitude === "number" && typeof longitude === "number") {
      place(latitude, longitude);
    }
    map.on("click", (e: L.LeafletMouseEvent) => {
      place(e.latlng.lat, e.latlng.lng);
      pickRef.current(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={divRef} style={{ height: 220, width: "100%", borderRadius: 8, zIndex: 0 }} />
      <p className="mt-1 text-xs text-slate-500">
        Click the map to drop the pin, or drag it.{" "}
        {typeof latitude === "number" && typeof longitude === "number"
          ? `Current: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : "No pin set yet."}
      </p>
    </div>
  );
}
