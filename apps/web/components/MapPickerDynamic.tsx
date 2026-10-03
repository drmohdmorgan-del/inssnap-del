"use client";

import dynamic from "next/dynamic";

/** Leaflet touches `window` — never server-render it. */
export const MapPicker = dynamic(
  () => import("./MapPicker").then((m) => m.MapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100">
        <p className="text-sm text-slate-400">Loading map…</p>
      </div>
    ),
  },
);
