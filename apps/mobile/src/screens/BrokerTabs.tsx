/**
 * Broker experience with per-role bottom tabs:
 *   Queue    — assignment queue (accept/decline, check-in, complete, rate)
 *   Showings — the broker's full showing history, newest first
 *
 * The container lifts useShowings and useUnits so both tabs share one
 * fetch. Behavior mirrors the original one-screen BrokerHome:
 * loading/error/empty states, pull-to-refresh, sign-out in the header,
 * and the post-completion rating flow.
 */

import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { InssnappClient } from "../api/client";
import type { SessionUser, Showing } from "../api/types";
import { brokerActions, brokerQueue } from "../flows/broker";
import { mineAs } from "../flows/common";
import { DEFAULT_TABS, ROLE_TABS, TabBar } from "../nav/tabs";
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

export interface RoleTabsProps extends ScreenProps {
  initialTab?: string;
}

const ACTION_LABELS: Record<string, string> = {
  "accept-assignment": "Accept assignment",
  "decline-assignment": "Decline assignment",
  "check-in": "Check in",
  complete: "Complete showing",
};

interface BrokerShared {
  client: InssnappClient;
  user: SessionUser;
  showings: Showing[];
  unitLabels: Record<string, string>;
  busy: string | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  act: (showing: Showing, action: string) => Promise<void>;
  ratingFor: Showing | null;
  setRatingFor: (s: Showing | null) => void;
  reload: () => void;
}

function QueueTab(shared: BrokerShared) {
  const {
    client,
    user,
    unitLabels,
    busy,
    refreshing,
    onRefresh,
    act,
    ratingFor,
    setRatingFor,
    reload,
  } = shared;
  // brokerQueue runs over the same shared showings list the
  // container fetches once for both tabs.
  const showings = shared.showings;
  const queue = brokerQueue(showings, user.userId);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
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

function ShowingsTab(shared: BrokerShared) {
  const { user, unitLabels, refreshing, onRefresh, showings } = shared;
  const mine = mineAs(showings, user.userId, "brokerUserId");
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Title>My showings</Title>
        {mine.length === 0 ? (
          <EmptyView message="No showings assigned to you yet." />
        ) : (
          mine.map((s) => (
            <ShowingCard key={s.id} showing={s} unitLabel={unitLabels[s.unitId]} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

export function BrokerTabs({ client, user, onSignOut, initialTab }: RoleTabsProps) {
  const { showings, error, reload } = useShowings(client);
  const unitLabels = useUnits(client);
  const tabs = ROLE_TABS.broker;
  const [tab, setTab] = useState(initialTab ?? DEFAULT_TABS.broker);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratingFor, setRatingFor] = useState<Showing | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

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

  const shared: BrokerShared = {
    client,
    user,
    showings,
    unitLabels,
    busy,
    refreshing,
    onRefresh,
    act,
    ratingFor,
    setRatingFor,
    reload,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Header title="Broker" user={user} onSignOut={onSignOut} />
      </View>
      {actionError ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <Body>{actionError}</Body>
          </Card>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {tab === "queue" && <QueueTab {...shared} />}
        {tab === "showings" && <ShowingsTab {...shared} />}
      </View>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
    </View>
  );
}
