"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapUnit = {
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
};

export type MapProperty = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  organizationName: string;
  units: MapUnit[];
};

const POLL_MS = 5000;

const STATE_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  RESIDENT_ACCEPTED: "Resident accepted",
  BROKER_GATE: "With broker",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
};

/**
 * Live INSSNAPP map (Phase 8) — Leaflet + OpenStreetMap tiles (free, no key).
 *
 * Polls /api/map every 5s. Markers reflect live state:
 * - Building pin: green = unit available, amber pulse = active showing,
 *   gray = nothing available.
 * - Active showings get their own pulsing markers (prospect/broker in popup).
 * - Popup lists every unit with live Available / Non-available status.
 */
export function LiveMap({
  height = 480,
  interactive = true,
}: {
  height?: number;
  interactive?: boolean;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const map = L.map(divRef.current, {
      zoomControl: interactive,
      attributionControl: true,
    }).setView([47.6062, -122.3321], 11); // default: Seattle pilot area
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layers;

    let stopped = false;

    function buildingIcon(p: MapProperty): L.DivIcon {
      const hasActive = p.units.some((u) => u.activeShowing);
      const hasAvailable = p.units.some((u) => u.eligible && u.residentAvailable);
      const color = hasActive ? "#f59e0b" : hasAvailable ? "#10b981" : "#94a3b8";
      const activeCount = p.units.filter((u) => u.activeShowing).length;
      return L.divIcon({
        className: "",
        html: `<div style="position:relative">
          <div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px">${p.units.length}</div>
          ${hasActive ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#f59e0b;border:2px solid white;animation:inssnapp-ping 1.5s infinite"></div>` : ""}
          ${activeCount > 0 ? `<div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#92400e;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;white-space:nowrap">${activeCount} live</div>` : ""}
        </div>
        <style>@keyframes inssnapp-ping{0%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
    }

    function showingIcon(index: number): L.DivIcon {
      // Small deterministic offset so multiple showings don't stack exactly.
      return L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.4);animation:inssnapp-ping 1.5s infinite"></div>
        <style>@keyframes inssnapp-ping{0%{transform:scale(1);opacity:1}100%{transform:scale(1.6);opacity:0}}</style>`,
        iconSize: [18, 18],
        iconAnchor: [9 + (index % 3) * 14 - 14, 9 + Math.floor(index / 3) * 14],
      });
    }

    function unitDot(u: MapUnit): string {
      if (u.activeShowing) return "#f59e0b";
      if (u.eligible && u.residentAvailable) return "#10b981";
      return "#cbd5e1";
    }

    function popupHtml(p: MapProperty): string {
      const rows = p.units
        .map((u) => {
          const status = u.activeShowing
            ? `🔶 ${STATE_LABEL[u.activeShowing.state] ?? u.activeShowing.state}${u.activeShowing.prospectName ? ` · ${esc(u.activeShowing.prospectName)}` : ""}${u.activeShowing.brokerName ? ` · broker ${esc(u.activeShowing.brokerName)}` : ""}`
            : u.eligible && u.residentAvailable
              ? "🟢 Available NOW"
              : "⚪ Not available";
          return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px">
            <span style="width:10px;height:10px;border-radius:50%;background:${unitDot(u)};flex-shrink:0"></span>
            <span><b>Unit ${esc(u.label)}</b> — ${status}</span></div>`;
        })
        .join("");
      return `<div style="min-width:220px;max-width:280px">
        <b style="font-size:14px">${esc(p.name)}</b><br/>
        <span style="font-size:11px;color:#64748b">${esc(p.address)}</span>
        <div style="margin-top:6px">${rows || '<span style="font-size:12px;color:#94a3b8">No units</span>'}</div>
      </div>`;
    }

    function esc(s: string): string {
      return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    }

    async function refresh() {
      try {
        const res = await fetch("/api/map");
        if (!res.ok) return;
        const data = (await res.json()) as { properties: MapProperty[] };
        const layers = layerRef.current;
        if (!layers) return;
        layers.clearLayers();

        const located = data.properties.filter(
          (p) => typeof p.latitude === "number" && typeof p.longitude === "number",
        );
        if (located.length === 0) return;

        const bounds: L.LatLngExpression[] = [];
        located.forEach((p) => {
          const lat = p.latitude as number;
          const lng = p.longitude as number;
          bounds.push([lat, lng]);
          L.marker([lat, lng], { icon: buildingIcon(p), interactive })
            .bindPopup(popupHtml(p))
            .addTo(layers);

          // One pulsing marker per active showing (prospect/broker flow markers).
          let si = 0;
          for (const u of p.units) {
            const s = u.activeShowing;
            if (!s) continue;
            L.marker([lat, lng], { icon: showingIcon(si++), interactive })
              .bindPopup(
                `<div style="font-size:12px"><b>🔶 ${STATE_LABEL[s.state] ?? s.state}</b><br/>` +
                  `Unit ${esc(u.label)} · ${esc(p.name)}<br/>` +
                  `${s.prospectName ? `Prospect: ${esc(s.prospectName)}<br/>` : ""}` +
                  `${s.brokerName ? `Broker: ${esc(s.brokerName)}` : "No broker — tenant-hosted"}</div>`,
              )
              .addTo(layers);
          }
        });

        // Fit on first load only — don't yank the view on every poll.
        const map = mapRef.current;
        if (map && !(map as unknown as { __fitted?: boolean }).__fitted) {
          (map as unknown as { __fitted?: boolean }).__fitted = true;
          map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 14 });
        }
      } catch {
        // Poll again next interval; the map keeps its last state.
      }
    }

    refresh();
    const timer = setInterval(() => {
      if (!stopped) refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  return (
    <div>
      <div ref={divRef} style={{ height, width: "100%", borderRadius: 12, zIndex: 0 }} />
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available NOW
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Active showing
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" /> Not available
        </span>
        <span className="ml-auto">Live · updates every 5s</span>
      </div>
    </div>
  );
}
