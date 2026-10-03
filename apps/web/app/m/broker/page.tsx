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

export default function MobileBrokerPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showings, setShowings] = useState<Showing[] | null>(null);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<string | null>(null);

  // Role guard: signed-out → /login; wrong role → /m.
  useEffect(() => {
    fetchSession().then((u) => {
      if (!u) router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
      else if (u.role !== "broker") router.replace("/m");
      else setUser(u);
    });
  }, [router]);

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
    if (user) load();
  }, [user, load]);

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
