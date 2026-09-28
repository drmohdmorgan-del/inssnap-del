"use client";

import { useEffect, useState, useCallback } from "react";

type Property = {
  id: string;
  name: string;
  address: string;
};

export function PropertiesManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/properties");
    if (res.ok) setProperties((await res.json()).properties);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not create property.");
      return;
    }
    setName("");
    setAddress("");
    await load();
  }

  async function saveEdit() {
    if (!editing) return;
    setError(null);
    const res = await fetch(`/api/properties/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, address: editing.address }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not update property.");
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove(id: string, propName: string) {
    if (!window.confirm(`Delete "${propName}" and all of its units?`)) return;
    setError(null);
    const res = await fetch(`/api/properties/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not delete property.");
      return;
    }
    await load();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Properties</h2>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form onSubmit={create} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Property name"
          maxLength={120}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address"
          maxLength={240}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !name.trim() || !address.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          Add property
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : properties.length === 0 ? (
        <p className="text-sm text-slate-500">No properties yet.</p>
      ) : (
        <div className="space-y-2">
          {properties.map((p) =>
            editing?.id === p.id ? (
              <div key={p.id} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1.5fr_auto_auto]">
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  maxLength={120}
                />
                <input
                  value={editing.address}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  maxLength={240}
                />
                <button
                  onClick={saveEdit}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">{p.address}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(p.id, p.name)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
