"use client";

import { useEffect, useState, useCallback } from "react";

type ModeStatus = {
  mode: "sandbox" | "production";
  adapter: string;
  sandbox: boolean;
  legalApproval: {
    id: string;
    approvedAt: string;
    approvedBy: string;
    notes: string;
  } | null;
  productionBlockedReason: string | null;
  productionPrerequisites: string[];
  recentScreenings: {
    id: string;
    prospectUserId: string;
    mode: string;
    status: string;
    detail: string;
    requestedAt: string;
    completedAt: string;
    requestedBy?: string;
  }[];
  consentRecords: {
    id: string;
    prospectUserId: string;
    scopeText: string;
    consentedAt: string;
    recordedBy: string;
  }[];
};

const STATUS_STYLES: Record<string, string> = {
  clear: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-800",
  consider: "bg-orange-100 text-orange-800",
};

/**
 * Checkr sandbox status panel for the Control Center (TASK-009, scope §4).
 *
 * Renders the current screening mode prominently, recent sandbox
 * screenings, consent records, and the production prerequisites — so the
 * compliance-safe boundary is always visible to management, not buried in
 * docs. Results are informational only; nothing here feeds an autonomous
 * housing decision.
 */
export function ScreeningPanel() {
  const [data, setData] = useState<ModeStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/screening");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Checkr Sandbox Status</h2>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-slate-400">Unavailable.</p>
      ) : (
        <div className="space-y-4">
          {/* Prominent mode banner — the compliance-safe boundary, always visible. */}
          <div
            className={`rounded-lg px-3 py-2.5 ${
              data.mode === "sandbox"
                ? "bg-amber-50 ring-1 ring-amber-200"
                : "bg-emerald-50 ring-1 ring-emerald-200"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">
              Mode: {data.mode.toUpperCase()}
              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">
                {data.adapter}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {data.mode === "sandbox"
                ? "Mocked fixtures only — no real consumer report is ever obtained in this mode."
                : "Production consumer-report processing is active."}
            </p>
            {data.productionBlockedReason && (
              <p className="mt-1 text-xs text-amber-800">{data.productionBlockedReason}</p>
            )}
          </div>

          {/* Recent sandbox screenings */}
          <div>
            <h3 className="mb-1.5 text-sm font-medium text-slate-700">Recent screenings</h3>
            {data.recentScreenings.length === 0 ? (
              <p className="text-xs text-slate-400">No screenings run yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.recentScreenings.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-700">
                        {r.prospectUserId}
                        <span className="ml-2 font-normal text-slate-400">{r.id}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{r.detail}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {r.completedAt} · requested by {r.requestedBy ?? "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_STYLES[r.status] ?? "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Consent records */}
          <div>
            <h3 className="mb-1.5 text-sm font-medium text-slate-700">Consent records</h3>
            {data.consentRecords.length === 0 ? (
              <p className="text-xs text-slate-400">
                No consent recorded. A screening request fails closed without one.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.consentRecords.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-700">{c.prospectUserId}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{c.scopeText}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {c.consentedAt} · recorded by {c.recordedBy}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Production prerequisites */}
          <div>
            <h3 className="mb-1.5 text-sm font-medium text-slate-700">
              Production prerequisites (scope §4)
            </h3>
            <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-slate-500">
              {data.productionPrerequisites.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Legal approval:{" "}
              {data.legalApproval ? (
                <span className="font-medium text-slate-700">
                  recorded {data.legalApproval.approvedAt} by {data.legalApproval.approvedBy}
                </span>
              ) : (
                <span className="font-medium text-amber-700">not recorded</span>
              )}
            </p>
          </div>

          <p className="text-[11px] text-slate-400">
            Screening results are informational only and never feed an autonomous housing
            decision — the Showing Engine has no screening dependency (scope §4).
          </p>
        </div>
      )}
    </section>
  );
}
