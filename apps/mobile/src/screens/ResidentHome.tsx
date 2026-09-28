/**
 * Resident experience (TASK-004) — one-screen workflow:
 * Available NOW toggle → verified resident/unit status → incoming
 * request inbox → accept/decline → live showing status → complete + rate.
 */

import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { ResidentEnrollment, Showing } from "../api/types";
import { residentActions, residentActive, residentInbox } from "../flows/resident";
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

export function ResidentHome({ client, user, onSignOut }: ScreenProps) {
  const { showings, error, reload } = useShowings(client);
  const unitLabels = useUnits(client);
  const [enrollments, setEnrollments] = useState<ResidentEnrollment[] | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<Showing | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
        prev?.map((e) => (e.unitId === unitId ? { ...e, residentAvailable: updated.residentAvailable } : e)) ?? prev,
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
    await Promise.all([loadEnrollments(), (async () => reload())()]);
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
  if (showings === null || enrollments === null) return <LoadingView message="Loading your home…" />;

  const inbox = residentInbox(showings, user.userId);
  const active = residentActive(showings, user.userId).filter((s) => s.state !== "REQUESTED");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Header title="Resident" user={user} onSignOut={onSignOut} />
        {actionError ? (
          <Card>
            <Body>{actionError}</Body>
          </Card>
        ) : null}

        {/* Verified resident/unit status + Available NOW toggle */}
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

        {/* Incoming requests */}
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

        {/* Live showing status */}
        <Title>Live showings</Title>
        {active.length === 0 ? (
          <EmptyView message="Nothing in progress." />
        ) : (
          active.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={unitLabels[s.unitId]}>
              {residentActions(s.state).map((a) => {
                if (a === "rate") {
                  return (
                    <Button key={a} label="Rate showing" kind="secondary" onPress={() => setRatingFor(s)} />
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
        <Button label="Refresh" kind="ghost" onPress={onRefresh} disabled={refreshing} />
      </View>
    </ScrollView>
  );
}
