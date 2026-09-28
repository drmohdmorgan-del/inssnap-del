/**
 * Resident experience with per-role bottom tabs:
 *   Units — verified resident/unit status + Available NOW toggles
 *   Requests — incoming request inbox (accept / decline)
 *   Showings — live showing status (check-in / complete / rate)
 *
 * The container lifts useShowings, useUnits, and enrollments so all
 * tabs share one fetch. Behavior mirrors the original one-screen
 * ResidentHome: loading/error/empty states, pull-to-refresh, sign-out
 * in the header, and the post-completion rating flow.
 */

import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { InssnappClient } from "../api/client";
import type { ResidentEnrollment, SessionUser, Showing } from "../api/types";
import { residentActions, residentActive, residentInbox } from "../flows/resident";
import { DEFAULT_TABS, ROLE_TABS, TabBar } from "../nav/tabs";
import {
  Body,
  Button,
  Card,
  EmptyView,
  ErrorView,
  LoadingView,
  Muted,
  Subtitle,
  Title,
  ToggleRow,
  theme,
} from "../ui/components";
import {
  actionMessage,
  Header,
  RatingSheet,
  ShowingCard,
  useShowings,
  useUnits,
  type ScreenProps,
} from "./shared";

export interface RoleTabsProps extends ScreenProps {
  initialTab?: string;
}

interface ResidentShared {
  client: InssnappClient;
  user: SessionUser;
  showings: Showing[];
  unitLabels: Record<string, string>;
  enrollments: ResidentEnrollment[];
  enrollError: string | null;
  loadEnrollments: () => Promise<void>;
  busy: string | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  toggleAvailability: (unitId: string, available: boolean) => Promise<void>;
  act: (showing: Showing, kind: string) => Promise<void>;
  ratingFor: Showing | null;
  setRatingFor: (s: Showing | null) => void;
  reload: () => void;
}

function tabScroll(shared: ResidentShared) {
  return (
    <RefreshControl refreshing={shared.refreshing} onRefresh={shared.onRefresh} />
  );
}

function UnitsTab(shared: ResidentShared) {
  const {
    enrollments,
    enrollError,
    loadEnrollments,
    busy,
    toggleAvailability,
  } = shared;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={tabScroll(shared)}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Title>Your units</Title>
        {enrollError ? (
          <Card>
            <Body>{enrollError}</Body>
            <Button label="Retry" kind="secondary" onPress={loadEnrollments} />
          </Card>
        ) : enrollments.length === 0 ? (
          <EmptyView message="No verified unit is linked to your account yet. Ask your property manager to enroll you." />
        ) : (
          enrollments.map((e) => (
            <Card key={e.unitId}>
              <Subtitle>
                Unit {e.unitLabel} · {e.propertyName}
              </Subtitle>
              <Muted>
                {e.verified ? "✓ Verified resident" : "Not verified"}
                {!e.eligible ? " · unit not eligible" : ""}
              </Muted>
              <View style={{ height: 8 }} />
              <ToggleRow
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
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function RequestsTab(shared: ResidentShared) {
  const { showings, user, unitLabels, busy, act } = shared;
  const inbox = residentInbox(showings, user.userId);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={tabScroll(shared)}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Title>Incoming requests</Title>
        {inbox.length === 0 ? (
          <EmptyView message="No new showing requests right now." />
        ) : (
          inbox.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={unitLabels[s.unitId]}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={busy === `accept-${s.id}` ? "…" : "Accept"}
                    onPress={() => act(s, "accept")}
                    disabled={busy !== null}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={busy === `decline-${s.id}` ? "…" : "Decline"}
                    kind="danger"
                    onPress={() => act(s, "decline")}
                    disabled={busy !== null}
                  />
                </View>
              </View>
            </ShowingCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function ShowingsTab(shared: ResidentShared) {
  const {
    showings,
    user,
    unitLabels,
    busy,
    act,
    ratingFor,
    setRatingFor,
    reload,
    client,
  } = shared;
  const active = residentActive(showings, user.userId).filter((s) => s.state !== "REQUESTED");
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={tabScroll(shared)}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Title>Live showings</Title>
        {active.length === 0 ? (
          <EmptyView message="Nothing in progress." />
        ) : (
          active.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={unitLabels[s.unitId]}>
              {residentActions(s.state).map((a) => {
                if (a === "rate") {
                  return (
                    <Button
                      key={a}
                      label="Rate showing"
                      kind="secondary"
                      onPress={() => setRatingFor(s)}
                    />
                  );
                }
                const labels: Record<string, string> = {
                  "check-in": "Check in",
                  complete: "Complete showing",
                };
                return (
                  <Button
                    key={a}
                    label={busy === `${a}-${s.id}` ? "…" : (labels[a] ?? a)}
                    onPress={() => act(s, a)}
                    disabled={busy !== null}
                  />
                );
              })}
            </ShowingCard>
          ))
        )}
        {ratingFor ? (
          <RatingSheet
            showing={ratingFor}
            client={client}
            onClose={() => {
              setRatingFor(null);
              reload();
            }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

export function ResidentTabs({ client, user, onSignOut, initialTab }: RoleTabsProps) {
  const { showings, error, reload } = useShowings(client);
  const unitLabels = useUnits(client);
  const tabs = ROLE_TABS.resident;
  const [tab, setTab] = useState(initialTab ?? DEFAULT_TABS.resident);
  const [enrollments, setEnrollments] = useState<ResidentEnrollment[] | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<Showing | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const loadEnrollments = useCallback(async () => {
    try {
      setEnrollments(await client.myEnrollments());
      setEnrollError(null);
    } catch (err) {
      setEnrollError(actionMessage(err));
    }
  }, [client]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  async function toggleAvailability(unitId: string, available: boolean) {
    setBusy(`avail-${unitId}`);
    setActionError(null);
    try {
      const updated = await client.setAvailability(unitId, available);
      setEnrollments((prev) =>
        prev?.map((e) =>
          e.unitId === unitId ? { ...e, residentAvailable: updated.residentAvailable } : e,
        ) ?? prev,
      );
    } catch (err) {
      setActionError(actionMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function act(showing: Showing, kind: string) {
    const key = `${kind}-${showing.id}`;
    setBusy(key);
    setActionError(null);
    try {
      switch (kind) {
        case "accept":
          await client.residentAccept(showing.id);
          break;
        case "decline":
          await client.residentDecline(showing.id);
          break;
        case "check-in":
          await client.checkIn(showing.id);
          break;
        case "complete":
          await client.complete(showing.id);
          break;
      }
      reload();
    } catch (err) {
      setActionError(actionMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadEnrollments(), Promise.resolve().then(() => reload())]);
    setRefreshing(false);
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
        <Header title="Resident" user={user} onSignOut={onSignOut} />
        <ErrorView message={error} onRetry={reload} />
      </View>
    );
  }
  if (showings === null || enrollments === null) {
    return <LoadingView message="Loading your home…" />;
  }

  const shared: ResidentShared = {
    client,
    user,
    showings,
    unitLabels,
    enrollments,
    enrollError,
    loadEnrollments,
    busy,
    refreshing,
    onRefresh,
    toggleAvailability,
    act,
    ratingFor,
    setRatingFor,
    reload,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Header title="Resident" user={user} onSignOut={onSignOut} />
      </View>
      {actionError ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <Body>{actionError}</Body>
          </Card>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {tab === "units" && <UnitsTab {...shared} />}
        {tab === "requests" && <RequestsTab {...shared} />}
        {tab === "showings" && <ShowingsTab {...shared} />}
      </View>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
    </View>
  );
}
