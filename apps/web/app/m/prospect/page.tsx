/**
 * Mobile web Prospect experience — mirrors apps/mobile ProspectHome:
 * eligible unit discovery → unit detail → request showing →
 * live request status → Apply / Watch / Decline on completed showings.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSession } from "../../../lib/session";
import { mobileApi, MobileApiError } from "../_components/api";
import {
  discoverableUnits,
  prospectActions,
  prospectActiveRequests,
  unitMatchesQuery,
  type ProspectAction,
} from "../_components/flows";
import type { SessionUser, Showing, ShowingOutcome, Unit } from "../_components/types";
import {
  EmptyView,
  ErrorView,
  LoadingView,
  MButton,
  MCard,
  MobileHeader,
  MobileShell,
  RatingForm,
  SectionTitle,
  ShowingCard,
} from "../_components/ui";

const OUTCOME_LABEL: Record<ProspectAction, string> = {
  apply: "Apply",
  watch: "Watch",
  decline: "Decline",
};

export default function MobileProspectPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showings, setShowings] = useState<Showing[] | null>(null);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Role guard: signed-out → /login; wrong role → /m.
  useEffect(() => {
    fetchSession().then((u) => {
      if (!u) router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
      else if (u.role !== "prospect") router.replace("/m");
      else setUser(u);
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, u] = await Promise.all([mobileApi.listShowings(), mobileApi.listUnits()]);
      setShowings(s);
      setUnits(u);
    } catch (err) {
      setLoadError(err instanceof MobileApiError ? err.message : "Could not load data.");
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function requestShowing(unit: Unit) {
    setBusy(`request-${unit.id}`);
    setActionError(null);
    try {
      await mobileApi.requestShowing(unit.id);
      setSelectedId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof MobileApiError ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function submitOutcome(showing: Showing, action: ProspectAction) {
    setBusy(`${action}-${showing.id}`);
    setActionError(null);
    try {
      await mobileApi.recordOutcome(showing.id, action.toUpperCase() as ShowingOutcome);
      await load();
    } catch (err) {
      setActionError(err instanceof MobileApiError ? err.message : "Could not record outcome.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await mobileApi.signOut();
    router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
  }

  if (!user || showings === null || units === null) {
    return (
      <MobileShell>
        {loadError ? (
          <>
            <div className="py-5" />
            <ErrorView message={loadError} onRetry={load} />
          </>
        ) : (
          <LoadingView message="Finding available units…" />
        )}
      </MobileShell>
    );
  }

  const available = discoverableUnits(units).filter((u) => unitMatchesQuery(u, query));
  const active = prospectActiveRequests(showings, user.userId);
  const completed = showings.filter(
    (s) => s.prospectUserId === user.userId && s.state === "COMPLETED",
  );
  // Decided showings (OUTCOME): decision is recorded, but the prospect can
  // still rate the visit.
  const decided = showings.filter(
    (s) => s.prospectUserId === user.userId && s.state === "OUTCOME",
  );
  const labelsByUnit: Record<string, string> = {};
  for (const u of units) labelsByUnit[u.id] = u.label;

  return (
    <MobileShell>
      <MobileHeader title="Find a home" email={user.email} onSignOut={signOut} />

      <ReadyCard />

      {actionError && (
        <MCard>
          <p className="text-sm text-red-700">{actionError}</p>
        </MCard>
      )}

      {(active.length > 0 || completed.length > 0 || decided.length > 0) && (
        <>
          <SectionTitle>My requests</SectionTitle>
          {active.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={labelsByUnit[s.unitId] ?? "—"}>
              <p className="text-sm text-slate-500">
                We’ll update this as the resident and office respond.
              </p>
            </ShowingCard>
          ))}
          {completed.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={labelsByUnit[s.unitId] ?? "—"}>
              <p className="mb-2 text-sm font-semibold text-slate-700">What’s next?</p>
              <div className="flex gap-2">
                {prospectActions(s.state).map((a) => (
                  <div key={a} className="flex-1">
                    <MButton
                      kind={a === "decline" ? "danger" : "primary"}
                      disabled={busy !== null}
                      onClick={() => submitOutcome(s, a)}
                    >
                      {busy === `${a}-${s.id}` ? "…" : OUTCOME_LABEL[a]}
                    </MButton>
                  </div>
                ))}
              </div>
              {ratingFor === s.id ? (
                <RatingForm
                  showingId={s.id}
                  onDone={() => {
                    setRatingFor(null);
                    load();
                  }}
                />
              ) : (
                <div className="mt-2">
                  <MButton kind="secondary" onClick={() => setRatingFor(s.id)}>
                    Rate your visit
                  </MButton>
                </div>
              )}
            </ShowingCard>
          ))}
          {decided.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={labelsByUnit[s.unitId] ?? "—"}>
              <p className="mb-2 text-sm text-slate-600">
                Decision recorded:{" "}
                <span className="font-semibold">
                  {s.outcome === "APPLY" ? "Applied" : s.outcome === "WATCH" ? "Watching" : "Declined"}
                </span>
              </p>
              {ratingFor === s.id ? (
                <RatingForm
                  showingId={s.id}
                  onDone={() => {
                    setRatingFor(null);
                    load();
                  }}
                />
              ) : (
                <MButton kind="secondary" onClick={() => setRatingFor(s.id)}>
                  Rate your visit
                </MButton>
              )}
            </ShowingCard>
          ))}
        </>
      )}

      <SectionTitle>Available units</SectionTitle>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by unit label or building…"
        aria-label="Search units"
        className="mb-3 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
      />
      {available.length === 0 ? (
        <EmptyView message="No units are available for showing right now. Check back soon." />
      ) : (
        available.map((u) => (
          <MCard key={u.id}>
            <h3 className="text-sm font-bold text-slate-900">
              Unit {u.label}
              {u.propertyName ? ` · ${u.propertyName}` : ""}
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Resident available now · ready for showing requests
            </p>
            {selectedId === u.id ? (
              <div>
                <p className="mb-3 text-sm text-slate-600">
                  Request a showing of unit {u.label}. The resident will accept or
                  decline — you’ll see live status updates here.
                </p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <MButton disabled={busy !== null} onClick={() => requestShowing(u)}>
                      {busy === `request-${u.id}` ? "Requesting…" : "Request showing"}
                    </MButton>
                  </div>
                  <MButton kind="ghost" disabled={busy !== null} onClick={() => setSelectedId(null)}>
                    Cancel
                  </MButton>
                </div>
              </div>
            ) : (
              <MButton kind="secondary" onClick={() => setSelectedId(u.id)}>
                View
              </MButton>
            )}
          </MCard>
        ))
      )}
    </MobileShell>
  );
}


type ReadyView = {
  tier: "base" | "ready";
  application: {
    moveInDate: string | null;
    occupants: number | null;
    hasPets: boolean | null;
    employmentStatus: string | null;
    incomeRange: string | null;
    statement: string | null;
  };
  documents: { type: string; recordedAt: string }[];
  readiness: {
    applicationComplete: boolean;
    documentsLoaded: boolean;
    screeningCompleted: boolean;
    screeningStatus: string | null;
    packetAssembled: boolean;
  };
};

const DOC_SLOTS: { type: string; label: string }[] = [
  { type: "government_id", label: "Government ID" },
  { type: "proof_of_income", label: "Proof of income" },
  { type: "rental_history", label: "Rental history" },
];

/**
 * Ready tier card (2026-11-03): the premium product is TIME — a
 * pre-assembled packet (screening done once, documents recorded,
 * application complete) so the prospective can submit instantly when a
 * unit drops. Pre-assembled is NOT pre-approved: management vets and
 * decides every file. Free during the pilot (no payment provider yet).
 */
function ReadyCard() {
  const [view, setView] = useState<ReadyView | null>(null);
  const [form, setForm] = useState({ moveInDate: "", occupants: "", employmentStatus: "", incomeRange: "" });
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/me");
      if (!res.ok) return;
      const data = (await res.json()) as ReadyView;
      setView(data);
      setForm({
        moveInDate: data.application.moveInDate ?? "",
        occupants: data.application.occupants?.toString() ?? "",
        employmentStatus: data.application.employmentStatus ?? "",
        incomeRange: data.application.incomeRange ?? "",
      });
      setDocs(new Set(data.documents.map((d) => d.type)));
    } catch {
      // Card is additive.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(tier?: "base" | "ready") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/prospects/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(tier ? { tier } : {}),
          moveInDate: form.moveInDate || undefined,
          occupants: form.occupants ? Number(form.occupants) : undefined,
          employmentStatus: form.employmentStatus || undefined,
          incomeRange: form.incomeRange || undefined,
          documents: [...docs],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save your packet.");
        return;
      }
      setView(data as ReadyView);
    } catch {
      setError("Could not save your packet.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;
  const r = view.readiness;
  const check = (done: boolean, label: string) => (
    <p className="text-xs text-slate-600">
      <span className={done ? "text-emerald-600" : "text-slate-400"}>{done ? "✓" : "○"}</span>{" "}
      {label}
    </p>
  );

  return (
    <MCard>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">
          {view.tier === "ready" ? "Ready packet" : "Get Ready — skip the scramble"}
        </h3>
        {view.tier === "ready" && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.packetAssembled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {r.packetAssembled ? "Your application is Ready" : "in progress"}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Ready is speed, not a shortcut past review: screening done once, documents and financials
        loaded, application complete — so you can submit the instant a unit drops. Management
        still vets and decides every application.
      </p>
      <div className="mt-2 space-y-0.5">
        {check(r.applicationComplete, "Application complete")}
        {check(r.documentsLoaded, "Documents on record")}
        {check(
          r.screeningCompleted,
          r.screeningCompleted
            ? `Screening on file (${r.screeningStatus})`
            : "Screening — completed once management runs it after your consent",
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input type="date" value={form.moveInDate} onChange={(e) => setForm({ ...form, moveInDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" aria-label="Move-in date" />
        <input type="number" min={1} max={20} value={form.occupants} onChange={(e) => setForm({ ...form, occupants: e.target.value })} placeholder="Occupants" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <input type="text" value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })} placeholder="Employment" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <input type="text" value={form.incomeRange} onChange={(e) => setForm({ ...form, incomeRange: e.target.value })} placeholder="Income range" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
      </div>
      <div className="mt-2 space-y-1">
        {DOC_SLOTS.map((slot) => (
          <label key={slot.type} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={docs.has(slot.type)}
              onChange={(e) => {
                const next = new Set(docs);
                if (e.target.checked) next.add(slot.type);
                else next.delete(slot.type);
                setDocs(next);
              }}
            />
            {slot.label} — I have this ready to present
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <div className="flex-1">
          <MButton kind="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "…" : "Save packet"}
          </MButton>
        </div>
        {view.tier === "base" && (
          <div className="flex-1">
            <MButton kind="primary" disabled={busy} onClick={() => void save("ready")}>
              {busy ? "…" : "Go Ready (free in pilot)"}
            </MButton>
          </div>
        )}
      </div>
    </MCard>
  );
}
