"use client";

import { useEffect, useState, useCallback } from "react";

type WorkflowOrg = {
  orgId: string;
  orgName: string;
  totalShowings: number;
  transitions24h: number;
  byState: Record<string, number>;
};

type Workflow = {
  orgs: WorkflowOrg[];
  totals: { totalShowings: number; transitions24h: number; byState: Record<string, number> };
};

const STATE_COLORS: Record<string, string> = {
  AVAILABLE: "bg-emerald-500",
  REQUESTED: "bg-amber-500",
  RESIDENT_ACCEPTED: "bg-blue-500",
  BROKER_GATE: "bg-purple-500",
  CONFIRMED: "bg-indigo-500",
  IN_PROGRESS: "bg-cyan-500",
  COMPLETED: "bg-teal-500",
  OUTCOME: "bg-slate-400",
};

export function WorkflowMonitor() {
  const [data, setData] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/control/workflow");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!data) return <p className="text-sm text-slate-500">Could not load workflow data.</p>;

  const total = data.totals.totalShowings || 1;
  const states = Object.entries(data.totals.byState).sort((a, b) => b[1] - a[1]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Workflow Monitor</h2>
        <span className="text-xs text-slate-500">
          {data.totals.transitions24h} transitions · last 24h
        </span>
      </div>

      <div className="mb-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {states.map(([state, count]) => (
            <div
              key={state}
              title={`${state}: ${count}`}
              className={STATE_COLORS[state] ?? "bg-slate-300"}
              style={{ width: `${(count / total) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {states.map(([state, count]) => (
            <span key={state} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className={`inline-block h-2 w-2 rounded-full ${STATE_COLORS[state] ?? "bg-slate-300"}`}
              />
              {state.replace(/_/g, " ")} · <span className="font-semibold">{count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {data.orgs.map((o) => (
          <div
            key={o.orgId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700">{o.orgName}</p>
              <p className="text-xs text-slate-500">
                {o.totalShowings} showings · {o.transitions24h} transitions in 24h
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(o.byState).map(([state, count]) => (
                <span
                  key={state}
                  className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200"
                >
                  {state.replace(/_/g, " ")} {count}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
