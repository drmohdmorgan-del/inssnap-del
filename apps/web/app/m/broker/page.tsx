/**
 * Mobile web Broker experience — mirrors apps/mobile BrokerHome:
 * assignment queue → accept/decline assignment → check-in →
 * complete + rate.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSession } from "../../../lib/session";
import { mobileApi, MobileApiError } from "../_components/api";
import {
  brokerActions,
  brokerQueue,
  type BrokerAction,
} from "../_components/flows";
import type { SessionUser, Showing } from "../_components/types";
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

const ACTION_LABELS: Record<Exclude<BrokerAction, "rate">, string> = {
  "accept-assignment": "Accept assignment",
  "decline-assignment": "Decline assignment",
  "check-in": "Check in",
  complete: "Complete showing",
};

type TierInfo = {
  tier: string;
  tierStartedAt: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  used: number;
  limit: number | null;
  canAcceptMore: boolean;
  tiers: Record<string, { id: string; name: string; blurb: string; leadLimit: number | null; trialDays: number | null; windowDays: number | null }>;
};

function TierCard({ tier, onChanged }: { tier: TierInfo | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectTier(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brokers/me/tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not change tier.");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!tier) return null;
  const current = tier.tiers[tier.tier];
  const pct = tier.limit ? Math.min(100, Math.round((tier.used / tier.limit) * 100)) : 0;

  return (
    <MCard>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Subscription · {current?.name ?? tier.tier}</h3>
        {tier.trialExpired && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            Trial expired
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {tier.limit === null
          ? `${tier.used} leads · unlimited`
          : `${tier.used} of ${tier.limit} leads used`}
        {!tier.canAcceptMore && " — limit reached"}
      </p>
      {tier.limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${tier.canAcceptMore ? "bg-brand-violet" : "bg-red-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {Object.values(tier.tiers).map((t) => (
          <button
            key={t.id}
            onClick={() => selectTier(t.id)}
            disabled={busy || t.id === tier.tier}
            className={`min-h-[44px] rounded-xl border-2 px-2 py-2 text-center transition disabled:opacity-50 ${
              t.id === tier.tier
                ? "border-brand-violet bg-brand-violet/5"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="block text-xs font-bold text-slate-900">{t.name}</span>
            <span className="block text-[10px] text-slate-500">
              {t.leadLimit === null ? "Unlimited" : `${t.leadLimit} leads`}
              {t.trialDays ? ` · ${t.trialDays}d free` : ""}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Pilot: tier selection is free — no payment provider connected yet.
      </p>
    </MCard>
  );
}

export default function MobileBrokerPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showings, setShowings] = useState<Showing[] | null>(null);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<string | null>(null);
  const [tier, setTier] = useState<TierInfo | null>(null);

  // Role guard: signed-out → /login; wrong role → /m.
  useEffect(() => {
    fetchSession().then((u) => {
      if (!u) router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
      else if (u.role !== "broker") router.replace("/m");
      else setUser(u);
    });
  }, [router]);

  const loadTier = useCallback(async () => {
    try {
      const res = await fetch("/api/brokers/me/tier");
      if (res.ok) setTier(await res.json());
    } catch {
      // Tier card is additive; the queue works without it.
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, u] = await Promise.all([mobileApi.listShowings(), mobileApi.listUnits()]);
      setShowings(s);
      const labels: Record<string, string> = {};
      for (const unit of u) labels[unit.id] = unit.label;
      setUnits(labels);
    } catch (err) {
      setLoadError(err instanceof MobileApiError ? err.message : "Could not load data.");
    }
  }, []);

  useEffect(() => {
    if (user) {
      load();
      loadTier();
    }
  }, [user, load, loadTier]);

  async function act(showing: Showing, action: Exclude<BrokerAction, "rate">) {
    const key = `${action}-${showing.id}`;
    setBusy(key);
    setActionError(null);
    try {
      switch (action) {
        case "accept-assignment":
          await mobileApi.brokerAccept(showing.id);
          break;
        case "decline-assignment":
          await mobileApi.brokerDecline(showing.id);
          break;
        case "check-in":
          await mobileApi.checkIn(showing.id);
          break;
        case "complete":
          await mobileApi.complete(showing.id);
          break;
      }
      await load();
    } catch (err) {
      setActionError(err instanceof MobileApiError ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await mobileApi.signOut();
    router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
  }

  if (!user || showings === null) {
    return (
      <MobileShell>
        {loadError ? (
          <>
            <div className="py-5" />
            <ErrorView message={loadError} onRetry={load} />
          </>
        ) : (
          <LoadingView message="Loading your assignments…" />
        )}
      </MobileShell>
    );
  }

  const queue = brokerQueue(showings, user.userId);

  return (
    <MobileShell>
      <MobileHeader title="Broker" email={user.email} onSignOut={signOut} />

      {actionError && (
        <MCard>
          <p className="text-sm text-red-700">{actionError}</p>
        </MCard>
      )}

      <TierCard tier={tier} onChanged={loadTier} />

      <SectionTitle>Assignment queue</SectionTitle>
      <p className="mb-3 text-sm text-slate-500">
        Showings assigned to you by management. Accept an assignment to move the
        showing toward confirmation.
      </p>

      {queue.length === 0 ? (
        <EmptyView message="No assignments right now." />
      ) : (
        queue.map((s) => (
          <ShowingCard key={s.id} showing={s} unitLabel={units[s.unitId] ?? "—"}>
            <div className="flex flex-col gap-2">
              {brokerActions(s.state).map((a) =>
                a === "rate" ? (
                  ratingFor === s.id ? (
                    <RatingForm
                      key={a}
                      showingId={s.id}
                      onDone={() => {
                        setRatingFor(null);
                        load();
                      }}
                    />
                  ) : (
                    <MButton key={a} kind="secondary" onClick={() => setRatingFor(s.id)}>
                      Rate showing
                    </MButton>
                  )
                ) : (
                  <MButton
                    key={a}
                    kind={a === "decline-assignment" ? "danger" : "primary"}
                    disabled={busy !== null}
                    onClick={() => act(s, a)}
                  >
                    {busy === `${a}-${s.id}` ? "…" : ACTION_LABELS[a]}
                  </MButton>
                ),
              )}
            </div>
          </ShowingCard>
        ))
      )}
    </MobileShell>
  );
}
