"use client";

import { useEffect, useState, useCallback } from "react";

type Property = {
  id: string;
  name: string;
};

type Unit = {
  id: string;
  propertyId: string;
  label: string;
  pmsExternalId: string | null;
  eligible: boolean;
  residentAvailable: boolean;
};

export function UnitsManager() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newPropertyId, setNewPropertyId] = useState("");

  const load = useCallback(async () => {
    const [uRes, pRes] = await Promise.all([
      fetch("/api/units"),
      fetch("/api/properties"),
    ]);
    if (uRes.ok) setUnits((await uRes.json()).units);
    if (pRes.ok) {
      const props = (await pRes.json()).properties as Property[];
      setProperties(props);
      setNewPropertyId((prev) => prev || props[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/units/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not update unit.");
      return;
    }
    await load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: newPropertyId, label: newLabel }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not create unit.");
      return;
    }
    setNewLabel("");
    await load();
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete unit "${label}"?`)) return;
    setError(null);
    const res = await fetch(`/api/units/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not delete unit.");
      return;
    }
    await load();
  }

  const propertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? "—";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Units</h2>
      <p className="mb-3 text-sm text-slate-500">
        Eligibility authorizes a unit for resident participation. The resident controls
        the separate “Available NOW” status.
      </p>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {properties.length > 0 && (
        <form onSubmit={create} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={newPropertyId}
            onChange={(e) => setNewPropertyId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="Property for new unit"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Unit label (e.g. 4B)"
            maxLength={40}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!newLabel.trim() || !newPropertyId}
            className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-violet-light disabled:opacity-40"
          >
            Add unit
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : units.length === 0 ? (
        <p className="text-sm text-slate-500">No units yet.</p>
      ) : (
        <div className="space-y-2">
          {units.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  {u.label} <span className="font-normal text-slate-400">· {propertyName(u.propertyId)}</span>
                </p>
                {u.pmsExternalId && (
                  <p className="font-mono text-xs text-slate-400">PMS {u.pmsExternalId}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => patch(u.id, { eligible: !u.eligible })}
                  title={u.eligible ? "Revoke eligibility" : "Authorize eligibility"}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    u.eligible
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {u.eligible ? "Eligible" : "Not eligible"}
                </button>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    u.residentAvailable
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-200 text-slate-500"
                  }`}
                  title="Resident-controlled availability"
                >
                  {u.residentAvailable ? "Available NOW" : "Not available"}
                </span>
                <button
                  onClick={() => remove(u.id, u.label)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
