/**
 * Mobile web Current Tenant (resident) experience — mirrors apps/mobile
 * ResidentHome: Available NOW toggle → verified resident/unit status →
 * incoming request inbox → accept/decline → live showing status →
 * complete + rate.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSession } from "../../../lib/session";
import { mobileApi, MobileApiError } from "../_components/api";
import {
  residentActions,
  residentActive,
  residentInbox,
  type ResidentAction,
} from "../_components/flows";
import type { ProspectProfile, ResidentEnrollment, SessionUser, Showing } from "../_components/types";
import {
  EmptyView,
  ErrorView,
  LoadingView,
  MButton,
  MCard,
  MobileHeader,
  MobileShell,
  MToggle,
  RatingForm,
  SectionTitle,
  ShowingCard,
} from "../_components/ui";

const ACTION_LABELS: Record<Exclude<ResidentAction, "rate">, string> = {
  accept: "Accept",
  decline: "Decline",
  "check-in": "Check in",
  complete: "Complete showing",
};

export default function MobileResidentPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showings, setShowings] = useState<Showing[] | null>(null);
  const [enrollments, setEnrollments] = useState<ResidentEnrollment[] | null>(null);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProspectProfile>>({});
  const [profileError, setProfileError] = useState<string | null>(null);

  // Role guard: signed-out → /login; wrong role → /m.
  useEffect(() => {
    fetchSession().then((u) => {
      if (!u) router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
      else if (u.role !== "resident") router.replace("/m");
      else setUser(u);
    });
  }, [router]);

  const loadEnrollments = useCallback(async () => {
    try {
      setEnrollments(await mobileApi.myEnrollments());
      setEnrollError(null);
    } catch (err) {
      setEnrollError(err instanceof MobileApiError ? err.message : "Could not load your units.");
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
      loadEnrollments();
    }
  }, [user, load, loadEnrollments]);

  async function toggleAvailability(unitId: string, available: boolean) {
    setBusy(`avail-${unitId}`);
    setActionError(null);
    try {
      const updated = await mobileApi.setAvailability(unitId, available);
      setEnrollments((prev) =>
        prev?.map((e) =>
          e.unitId === unitId ? { ...e, residentAvailable: updated.residentAvailable } : e,
        ) ?? prev,
      );
    } catch (err) {
      setActionError(err instanceof MobileApiError ? err.message : "Could not update availability.");
    } finally {
      setBusy(null);
    }
  }

  async function act(showing: Showing, action: Exclude<ResidentAction, "rate">) {
    const key = `${action}-${showing.id}`;
    setBusy(key);
    setActionError(null);
    try {
      switch (action) {
        case "accept":
          await mobileApi.residentAccept(showing.id);
          break;
        case "decline":
          await mobileApi.residentDecline(showing.id);
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

  async function toggleProfile(showing: Showing) {
    if (!showing.prospectUserId) return;
    if (profileFor === showing.id) {
      setProfileFor(null);
      return;
    }
    setProfileFor(showing.id);
    setProfileError(null);
    if (profiles[showing.prospectUserId]) return;
    try {
      const profile = await mobileApi.getProspectProfile(showing.prospectUserId);
      setProfiles((prev) => ({ ...prev, [showing.prospectUserId as string]: profile }));
    } catch (err) {
      setProfileError(err instanceof MobileApiError ? err.message : "Could not load the prospect profile.");
    }
  }

  if (!user || showings === null || enrollments === null) {
    return (
      <MobileShell>
        {loadError || enrollError ? (
          <>
            <div className="py-5" />
            <ErrorView
              message={loadError ?? enrollError ?? "Could not load data."}
              onRetry={() => {
                load();
                loadEnrollments();
              }}
            />
          </>
        ) : (
          <LoadingView message="Loading your home…" />
        )}
      </MobileShell>
    );
  }

  const inbox = residentInbox(showings, user.userId);
  const active = residentActive(showings, user.userId).filter((s) => s.state !== "REQUESTED");

  return (
    <MobileShell>
      <MobileHeader title="Current Tenant" email={user.email} onSignOut={signOut} />

      {actionError && (
        <MCard>
          <p className="text-sm text-red-700">{actionError}</p>
        </MCard>
      )}

      <SectionTitle>Your units</SectionTitle>
      {enrollments.length === 0 ? (
        <EmptyView message="No verified unit is linked to your account yet. Ask your property manager to enroll you." />
      ) : (
        enrollments.map((e) => (
          <MCard key={e.unitId}>
            <h3 className="text-sm font-bold text-slate-900">
              Unit {e.unitLabel} · {e.propertyName}
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              {e.verified ? "✓ Verified resident" : "Not verified"}
              {!e.eligible ? " · unit not eligible" : ""}
            </p>
            <MToggle
              label="Available NOW"
              hint={
                e.residentAvailable
                  ? "Prospects can request a showing of this unit."
                  : "You are hidden from prospect search right now."
              }
              value={e.residentAvailable}
              disabled={!e.eligible || busy === `avail-${e.unitId}`}
              onChange={(v) => toggleAvailability(e.unitId, v)}
            />
          </MCard>
        ))
      )}

      <SectionTitle>Incoming requests</SectionTitle>
      {profileError && (
        <MCard>
          <p className="text-sm text-red-700">{profileError}</p>
        </MCard>
      )}
      {inbox.length === 0 ? (
        <EmptyView message="No new showing requests right now." />
      ) : (
        inbox.map((s) => {
          const profile = s.prospectUserId ? profiles[s.prospectUserId] : undefined;
          const expanded = profileFor === s.id;
          return (
            <ShowingCard key={s.id} showing={s} unitLabel={units[s.unitId] ?? "—"}>
              {s.prospectUserId && (
                <MButton kind="secondary" onClick={() => toggleProfile(s)}>
                  {expanded ? "Hide prospect profile" : "View prospect profile"}
                </MButton>
              )}
              {expanded && profile && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-900">{profile.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {profile.emailVerified ? "✓ Email verified" : "Email not verified"} ·{" "}
                    {profile.stats.completedShowings} past showing
                    {profile.stats.completedShowings === 1 ? "" : "s"}
                  </p>
                  {profile.ratingsReceived.count > 0 ? (
                    <p className="mt-1 text-xs text-slate-600">
                      ★ {profile.ratingsReceived.avgStars} average from{" "}
                      {profile.ratingsReceived.count} rating
                      {profile.ratingsReceived.count === 1 ? "" : "s"}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">No ratings yet.</p>
                  )}
                  {profile.ratingsReceived.recent.map((r, i) => (
                    <p key={i} className="mt-1 text-xs italic text-slate-500">
                      “{r.comment || `${r.stars} stars`}”
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1">
                  <MButton disabled={busy !== null} onClick={() => act(s, "accept")}>
                    {busy === `accept-${s.id}` ? "…" : "Accept"}
                  </MButton>
                </div>
                <div className="flex-1">
                  <MButton
                    kind="danger"
                    disabled={busy !== null}
                    onClick={() => act(s, "decline")}
                  >
                    {busy === `decline-${s.id}` ? "…" : "Decline"}
                  </MButton>
                </div>
              </div>
            </ShowingCard>
          );
        })
      )}

      <SectionTitle>Live showings</SectionTitle>
      {active.length === 0 ? (
        <EmptyView message="Nothing in progress." />
      ) : (
        active.map((s) => (
          <ShowingCard key={s.id} showing={s} unitLabel={units[s.unitId] ?? "—"}>
            <div className="flex flex-col gap-2">
              {residentActions(s.state).map((a) =>
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
                  <MButton key={a} disabled={busy !== null} onClick={() => act(s, a)}>
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
