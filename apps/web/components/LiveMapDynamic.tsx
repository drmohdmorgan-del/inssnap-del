"use client";

import dynamic from "next/dynamic";

/** Leaflet touches `window` — never server-render it. */
export const LiveMap = dynamic(
  () => import("./LiveMap").then((m) => m.LiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl bg-slate-100">
        <p className="text-sm text-slate-400">Loading live map…</p>
      </div>
    ),
  },
);
