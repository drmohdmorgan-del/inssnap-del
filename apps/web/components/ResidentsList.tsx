"use client";

import { useEffect, useState, useCallback } from "react";

type Resident = {
  userId: string;
  email: string;
  fullName: string;
  unitId: string;
  unitLabel: string;
  propertyName: string;
  eligible: boolean;
  residentAvailable: boolean;
  participation: "available_now" | "enrolled";
};

const PARTICIPATION_STYLES: Record<string, string> = {
  available_now: "bg-emerald-100 text-emerald-800",
  enrolled: "bg-amber-100 text-amber-800",
};

const PARTICIPATION_LABELS: Record<string, string> = {
  available_now: "Available NOW",
  enrolled: "Enrolled · not available",
};

export function ResidentsList() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/residents");
    if (res.ok) setResidents((await res.json()).residents);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Residents</h2>
      <p className="mb-3 text-sm text-slate-500">
        Enrolled residents and their participation status. Enrollment and
        verification happen against the property record (TASK-004 mobile).
      </p>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : residents.length === 0 ? (
        <p className="text-sm text-slate-500">No enrolled residents yet.</p>
      ) : (
        <div className="space-y-2">
          {residents.map((r) => (
            <div
              key={`${r.userId}:${r.unitId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-700">{r.fullName}</p>
                <p className="truncate text-xs text-slate-500">
                  {r.email} · {r.unitLabel} — {r.propertyName}
                  {!r.eligible && " · unit not eligible"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  PARTICIPATION_STYLES[r.participation]
                }`}
              >
                {PARTICIPATION_LABELS[r.participation]}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
