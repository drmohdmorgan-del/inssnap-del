/**
 * Broker experience (TASK-006) — one-screen workflow:
 * assignment queue → accept/decline assignment → check-in →
 * showing status → complete + rate.
 */

import React, { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { Showing } from "../api/types";
import { brokerActions, brokerQueue } from "../flows/broker";
import {
  Body,
  Button,
  Card,
  EmptyView,
  ErrorView,
  LoadingView,
  Muted,
  Title,
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

const ACTION_LABELS: Record<string, string> = {
  "accept-assignment": "Accept assignment",
  "decline-assignment": "Decline assignment",
  "check-in": "Check in",
  complete: "Complete showing",
};

export function BrokerHome({ client, user, onSignOut }: ScreenProps) {
  const { showings, error, reload } = useShowings(client);
  const unitLabels = useUnits(client);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<Showing | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function act(showing: Showing, action: string) {
    const key = `${action}-${showing.id}`;
    setBusy(key);
    setActionError(null);
    try {
      switch (action) {
        case "accept-assignment":
          await client.brokerAccept(showing.id);
          break;
        case "decline-assignment":
          await client.brokerDecline(showing.id);
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
    reload();
    setRefreshing(false);
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
        <Header title="Broker" user={user} onSignOut={onSignOut} />
        <ErrorView message={error} onRetry={reload} />
      </View>
    );
  }
  if (showings === null) return <LoadingView message="Loading your assignments…" />;

  const queue = brokerQueue(showings, user.userId);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Header title="Broker" user={user} onSignOut={onSignOut} />
        {actionError ? (
          <Card>
            <Body>{actionError}</Body>
          </Card>
        ) : null}

        <Title>Assignment queue</Title>
        <Muted>
          Showings assigned to you by management. Accept an assignment to move the showing toward
          confirmation.
        </Muted>
        <View style={{ height: 8 }} />
        {queue.length === 0 ? (
          <EmptyView message="No assignments right now." />
        ) : (
          queue.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={unitLabels[s.unitId]}>
              {brokerActions(s.state).map((a) => {
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
                return (
                  <Button
                    key={a}
                    label={busy === `${a}-${s.id}` ? "…" : ACTION_LABELS[a]}
                    kind={a === "decline-assignment" ? "danger" : "primary"}
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
