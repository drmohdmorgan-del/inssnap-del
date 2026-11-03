"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Broker license vetting queue (DrMorgan 2026-11-03) — Management surface.
 *
 * Brokers submit license number + state at onboarding; verification is a
 * manual check against the state registry (most registries have no
 * public API). Management opens the registry lookup, confirms the
 * license is active/valid, and records verified / rejected here. A
 * broker cannot receive lead assignments until verified.
 */

type QueueItem = {
  brokerUserId: string;
  brokerName: string | null;
  brokerEmail: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  licenseStatus: "pending" | "verified" | "rejected";
  licenseSubmittedAt: string | null;
  licenseReviewedAt: string | null;
  licenseReviewNote: string | null;
  registry: { authority: string; lookupUrl: string | null; method: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export function BrokerLicensePanel() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/control/broker-licenses");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { queue: QueueItem[] };
      setQueue(data.queue);
      setError(null);
    } catch {
      setError("Could not load the license vetting queue.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (item: QueueItem, decision: "verified" | "rejected") => {
    setBusyId(item.brokerUserId);
    try {
      const res = await fetch("/api/control/broker-licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerUserId: item.brokerUserId,
          decision,
          note: notes[item.brokerUserId] || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (error && !queue) return <p className="text-sm text-red-600">{error}</p>;
  if (!queue) return <p className="text-sm text-slate-500">Loading vetting queue…</p>;

  const pending = queue.filter((q) => q.licenseStatus === "pending");
  const decided = queue.filter((q) => q.licenseStatus !== "pending");

  const renderItem = (item: QueueItem) => (
    <div key={item.brokerUserId} className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">
          {item.brokerName ?? item.brokerUserId}
          {item.brokerEmail ? (
            <span className="ml-2 text-xs font-normal text-slate-500">{item.brokerEmail}</span>
          ) : null}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.licenseStatus]}`}
        >
          {item.licenseStatus}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        License <span className="font-mono font-semibold">{item.licenseNumber}</span> ·{" "}
        {item.licenseState}
        {item.licenseSubmittedAt
          ? ` · submitted ${new Date(item.licenseSubmittedAt).toLocaleString()}`
          : ""}
        {item.licenseReviewedAt
          ? ` · reviewed ${new Date(item.licenseReviewedAt).toLocaleString()}`
          : ""}
      </p>
      {item.registry && (
        <p className="mt-0.5 text-xs text-slate-500">
          Registry: {item.registry.authority}
          {item.registry.lookupUrl ? (
            <>
              {" — "}
              <a
                href={item.registry.lookupUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-violet hover:underline"
              >
                open the registry lookup
              </a>
            </>
          ) : null}
        </p>
      )}
      {item.licenseReviewNote && (
        <p className="mt-0.5 text-xs text-slate-500">Note: {item.licenseReviewNote}</p>
      )}
      {item.licenseStatus === "pending" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Review note (optional)"
            value={notes[item.brokerUserId] ?? ""}
            onChange={(e) =>
              setNotes((n) => ({ ...n, [item.brokerUserId]: e.target.value }))
            }
            className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busyId === item.brokerUserId}
            onClick={() => void review(item, "verified")}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            Verify — license active
          </button>
          <button
            type="button"
            disabled={busyId === item.brokerUserId}
            onClick={() => void review(item, "rejected")}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Broker license vetting</h3>
        <p className="mt-1 text-sm text-slate-500">
          Brokers submit their license number and state at onboarding. Check each license in the
          state registry, then record the outcome — a broker cannot receive lead assignments
          until their license is verified.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          Awaiting review ({pending.length})
        </p>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No licenses awaiting review.</p>
        ) : (
          <div className="space-y-2">{pending.map(renderItem)}</div>
        )}
      </div>
      {decided.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Decided ({decided.length})</p>
          <div className="space-y-2">{decided.map(renderItem)}</div>
        </div>
      )}
    </div>
  );
}
