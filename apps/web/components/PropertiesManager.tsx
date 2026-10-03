"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPicker } from "./MapPickerDynamic";

type Property = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export function PropertiesManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState<Property | null>(null);
  const [locating, setLocating] = useState<Property | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
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

  function openLocate(p: Property) {
    setLocating(p);
    setPin(
      typeof p.latitude === "number" && typeof p.longitude === "number"
        ? { lat: p.latitude, lng: p.longitude }
        : null,
    );
    setError(null);
  }

  async function savePin() {
    if (!locating || !pin) return;
    setError(null);
    const res = await fetch(`/api/properties/${locating.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: pin.lat, longitude: pin.lng }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not save the pin.");
      return;
    }
    setLocating(null);
    setPin(null);
    await load();
  }

  async function geocode(p: Property) {
    setGeoBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${p.id}/geocode`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Geocoding failed.");
        return;
      }
      setLocating(null);
      await load();
    } finally {
      setGeoBusy(false);
    }
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
          className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-violet-light disabled:opacity-40"
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
                  className="rounded-lg bg-brand-violet px-3 py-2 text-sm font-medium text-white hover:bg-brand-violet-light"
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
                  <p className="truncate text-xs text-slate-500">
                    {p.address}
                    {typeof p.latitude === "number" && typeof p.longitude === "number" ? (
                      <span className="text-emerald-600"> · 📍 on map</span>
                    ) : (
                      <span className="text-amber-600"> · not on map</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openLocate(p)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-violet hover:bg-brand-violet/10"
                  >
                    Locate
                  </button>
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-violet hover:bg-brand-violet/10"
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
          {locating && (
            <div className="rounded-xl border-2 border-brand-violet/30 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Locate “{locating.name}”
                </h3>
                <button
                  onClick={() => geocode(locating)}
                  disabled={geoBusy}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-violet hover:text-brand-violet disabled:opacity-50"
                >
                  {geoBusy ? "Geocoding…" : "Geocode from address"}
                </button>
              </div>
              <MapPicker
                latitude={pin?.lat ?? locating.latitude}
                longitude={pin?.lng ?? locating.longitude}
                onPick={(lat, lng) => setPin({ lat, lng })}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={savePin}
                  disabled={!pin}
                  className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-semibold text-white hover:bg-brand-violet-light disabled:opacity-40"
                >
                  Save pin
                </button>
                <button
                  onClick={() => {
                    setLocating(null);
                    setPin(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
