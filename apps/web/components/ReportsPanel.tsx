"use client";

import { useEffect, useState, useCallback } from "react";
import { StatCard } from "./StatCard";

type Report = {
  funnel: Record<string, number>;
  totals: { showings: number; activeShowings: number; transitions: number };
  response: {
    responded: number;
    pending: number;
    avgSeconds: number | null;
    medianSeconds: number | null;
  };
  participation: { residentAccounts: number; enrolled: number; availableNow: number };
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function ReportsPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/reports");
    if (res.ok) setReport(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!report) return <p className="text-sm text-slate-500">Could not load reports.</p>;

  const funnelEntries = Object.entries(report.funnel).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Showings" value={report.totals.showings} accent="text-indigo-600" />
        <StatCard label="Active" value={report.totals.activeShowings} accent="text-blue-600" />
        <StatCard label="Transitions" value={report.totals.transitions} accent="text-purple-600" />
        <StatCard
          label="Available NOW"
          value={report.participation.availableNow}
          accent="text-emerald-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Showing Funnel</h2>
          {funnelEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No showings yet.</p>
          ) : (
            <div className="space-y-2">
              {funnelEntries.map(([state, count]) => (
                <div key={state} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs font-medium text-slate-600">
                    {state.replace(/_/g, " ")}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${report.totals.showings ? (count / report.totals.showings) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold text-slate-700">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Resident Response Times
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Time from a showing being requested to the resident&apos;s first response
            (accept or decline), derived from audit events.
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Responded</dt>
              <dd className="font-semibold text-slate-900">{report.response.responded}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Awaiting resident</dt>
              <dd className="font-semibold text-slate-900">{report.response.pending}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Average response</dt>
              <dd className="font-semibold text-slate-900">
                {formatDuration(report.response.avgSeconds)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Median response</dt>
              <dd className="font-semibold text-slate-900">
                {formatDuration(report.response.medianSeconds)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Resident Participation</h2>
        <dl className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg bg-slate-50 px-3 py-4">
            <dt className="text-xs text-slate-500">Resident accounts</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">
              {report.participation.residentAccounts}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-4">
            <dt className="text-xs text-slate-500">Enrolled in units</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">
              {report.participation.enrolled}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-4">
            <dt className="text-xs text-slate-500">Available NOW</dt>
            <dd className="mt-1 text-2xl font-bold text-emerald-700">
              {report.participation.availableNow}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
