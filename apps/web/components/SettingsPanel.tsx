"use client";

import { useEffect, useState, useCallback } from "react";

type Integration = {
  name: string;
  status: "connected" | "sandbox" | "not_connected" | "not_configured" | "error";
  detail: string;
  adapterType?: string;
  lastSyncAt?: string | null;
  lastHealthCheckAt?: string | null;
  healthStatus?: string | null;
};

type SyncResult = {
  ok: boolean;
  sync: {
    properties: { created: number; updated: number };
    units: { created: number; updated: number };
    residents: { linked: number; skippedNoUnit: number; skippedNoUser: number };
    errors: string[];
  };
};

const STATUS_STYLES: Record<Integration["status"], string> = {
  connected: "bg-emerald-100 text-emerald-800",
  sandbox: "bg-amber-100 text-amber-800",
  not_connected: "bg-slate-200 text-slate-700",
  not_configured: "bg-slate-200 text-slate-700",
  error: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<Integration["status"], string> = {
  connected: "connected",
  sandbox: "sandbox",
  not_connected: "not connected",
  not_configured: "not configured",
  error: "error",
};

export function SettingsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations");
    if (res.ok) setIntegrations((await res.json()).integrations);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setSyncError(body.error ?? "Sync failed.");
      } else {
        setSyncResult(body);
      }
    } catch {
      setSyncError("Sync request failed.");
    } finally {
      setSyncing(false);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">PMS Connection</h2>
        <p className="mb-3 text-sm text-slate-500">
          Property management remains the system of record for property and unit
          eligibility. Statuses below reflect what is actually configured — never
          a hardcoded badge.
        </p>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            {integrations.map((i) => (
              <div
                key={i.name}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    {i.name}
                    {i.adapterType && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">
                        {i.adapterType}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">{i.detail}</p>
                  {(i.lastSyncAt || i.lastHealthCheckAt) && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {i.lastSyncAt && <>Last sync: {i.lastSyncAt} · </>}
                      {i.lastHealthCheckAt && (
                        <>
                          Last health check: {i.lastHealthCheckAt}
                          {i.healthStatus ? ` (${i.healthStatus})` : ""}
                        </>
                      )}
                    </p>
                  )}
                  {i.adapterType === "sandbox" && (
                    <button
                      onClick={syncNow}
                      disabled={syncing}
                      className="mt-1.5 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {syncing ? "Syncing…" : "Sync now"}
                    </button>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[i.status]}`}
                >
                  {STATUS_LABELS[i.status]}
                </span>
              </div>
            ))}
          </div>
        )}
        {syncResult && (
          <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Sync {syncResult.ok ? "completed" : "finished with errors"}:{" "}
            {syncResult.sync.properties.created + syncResult.sync.properties.updated}{" "}
            properties ({syncResult.sync.properties.created} new),{" "}
            {syncResult.sync.units.created + syncResult.sync.units.updated} units (
            {syncResult.sync.units.created} new), {syncResult.sync.residents.linked}{" "}
            residents linked
            {syncResult.sync.errors.length > 0 &&
              ` — ${syncResult.sync.errors.length} row errors (see server logs)`}
            .
          </p>
        )}
        {syncError && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
            Sync failed: {syncError}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Organization</h2>
        <p className="text-sm text-slate-500">
          Organization settings (name, notification preferences, feature flags) are
          planned for a later phase. Portfolio data above is live.
        </p>
      </section>
    </div>
  );
}
