/**
 * Prospect experience with per-role bottom tabs:
 *   Discover    — eligible unit discovery, unit detail, request showing
 *   My requests — live request status + post-completion Apply / Watch / Decline
 *
 * The container lifts useShowings and the unit catalog so both tabs
 * share one fetch. Behavior mirrors the original one-screen
 * ProspectHome: loading/error/empty states, pull-to-refresh, sign-out
 * in the header.
 */

import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { InssnappClient } from "../api/client";
import type { SessionUser, Showing, Unit } from "../api/types";
import {
  discoverableUnits,
  prospectActions,
  prospectActiveRequests,
  unitMatchesQuery,
} from "../flows/prospect";
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
  TextField,
  Title,
  theme,
} from "../ui/components";
import {
  actionMessage,
  Header,
  ShowingCard,
  useShowings,
  type ScreenProps,
} from "./shared";

export interface RoleTabsProps extends ScreenProps {
  initialTab?: string;
}

interface ProspectShared {
  client: InssnappClient;
  user: SessionUser;
  showings: Showing[];
  units: Unit[];
  unitsError: string | null;
  loadUnits: () => Promise<void>;
  query: string;
  setQuery: (q: string) => void;
  selected: Unit | null;
  setSelected: (u: Unit | null) => void;
  busy: string | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  requestShowing: (unit: Unit) => Promise<void>;
  submitOutcome: (showing: Showing, outcome: "APPLY" | "WATCH" | "DECLINE") => Promise<void>;
  reload: () => void;
}

function DiscoverTab(shared: ProspectShared) {
  const {
    units,
    unitsError,
    loadUnits,
    query,
    setQuery,
    selected,
    setSelected,
    busy,
    refreshing,
    onRefresh,
    requestShowing,
  } = shared;
  const available = discoverableUnits(units).filter((u) => unitMatchesQuery(u, query));
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Title>Available units</Title>
        <TextField
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search by unit label…"
        />
        {unitsError ? (
          <Card>
            <Body>{unitsError}</Body>
            <Button label="Retry" kind="secondary" onPress={loadUnits} />
          </Card>
        ) : available.length === 0 ? (
          <EmptyView message="No units are available for showing right now. Check back soon." />
        ) : (
          available.map((u) => (
            <Card key={u.id}>
              <Subtitle>Unit {u.label}</Subtitle>
              <Muted>Resident available now · ready for showing requests</Muted>
              {selected?.id === u.id ? (
                <View>
                  <Body>
                    Request a showing of unit {u.label}. The resident will accept or decline —
                    you’ll see live status updates here.
                  </Body>
                  <Button
                    label={busy === `request-${u.id}` ? "Requesting…" : "Request showing"}
                    onPress={() => requestShowing(u)}
                    disabled={busy !== null}
                  />
                  <Button
                    label="Cancel"
                    kind="ghost"
                    onPress={() => setSelected(null)}
                    disabled={busy !== null}
                  />
                </View>
              ) : (
                <Button label="View" kind="secondary" onPress={() => setSelected(u)} />
              )}
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function MyRequestsTab(shared: ProspectShared) {
  const { showings, user, units, busy, refreshing, onRefresh, submitOutcome } = shared;
  const active = prospectActiveRequests(showings, user.userId);
  const completed = showings.filter(
    (s) => s.prospectUserId === user.userId && s.state === "COMPLETED",
  );
  const labelsByUnit: Record<string, string> = {};
  for (const u of units) labelsByUnit[u.id] = u.label;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Title>My requests</Title>
        {active.length === 0 && completed.length === 0 ? (
          <EmptyView message="You haven’t requested any showings yet. Browse available units to request one." />
        ) : (
          <View>
            {active.map((s) => (
              <ShowingCard key={s.id} showing={s} unitLabel={labelsByUnit[s.unitId]}>
                <Muted>We’ll update this as the resident and office respond.</Muted>
              </ShowingCard>
            ))}
            {completed.map((s) => (
              <ShowingCard key={s.id} showing={s} unitLabel={labelsByUnit[s.unitId]}>
                <Subtitle>What’s next?</Subtitle>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {prospectActions(s.state).map((a) => (
                    <View key={a} style={{ flex: 1 }}>
                      <Button
                        label={
                          busy === `${a.toUpperCase()}-${s.id}`
                            ? "…"
                            : a === "apply"
                              ? "Apply"
                              : a === "watch"
                                ? "Watch"
                                : "Decline"
                        }
                        kind={a === "decline" ? "danger" : "primary"}
                        onPress={() =>
                          submitOutcome(s, a.toUpperCase() as "APPLY" | "WATCH" | "DECLINE")
                        }
                        disabled={busy !== null}
                      />
                    </View>
                  ))}
                </View>
              </ShowingCard>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export function ProspectTabs({ client, user, onSignOut, initialTab }: RoleTabsProps) {
  const { showings, error, reload } = useShowings(client);
  const tabs = ROLE_TABS.prospect;
  const [tab, setTab] = useState(initialTab ?? DEFAULT_TABS.prospect);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Unit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  async function loadUnits() {
    try {
      setUnits(await client.listUnits());
      setUnitsError(null);
    } catch (err) {
      setUnitsError(actionMessage(err));
    }
  }

  useEffect(() => {
    loadUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  async function requestShowing(unit: Unit) {
    setBusy(`request-${unit.id}`);
    setActionError(null);
    try {
      await client.requestShowing(unit.id);
      setSelected(null);
      reload();
    } catch (err) {
      setActionError(actionMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitOutcome(showing: Showing, outcome: "APPLY" | "WATCH" | "DECLINE") {
    setBusy(`${outcome}-${showing.id}`);
    setActionError(null);
    try {
      await client.recordOutcome(showing.id, outcome);
      reload();
    } catch (err) {
      setActionError(actionMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadUnits(), Promise.resolve().then(() => reload())]);
    setRefreshing(false);
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
        <Header title="Find a home" user={user} onSignOut={onSignOut} />
        <ErrorView message={error} onRetry={reload} />
      </View>
    );
  }
  if (showings === null || units === null) {
    return <LoadingView message="Finding available units…" />;
  }

  const shared: ProspectShared = {
    client,
    user,
    showings,
    units,
    unitsError,
    loadUnits,
    query,
    setQuery,
    selected,
    setSelected,
    busy,
    refreshing,
    onRefresh,
    requestShowing,
    submitOutcome,
    reload,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Header title="Find a home" user={user} onSignOut={onSignOut} />
      </View>
      {actionError ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <Body>{actionError}</Body>
          </Card>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {tab === "discover" && <DiscoverTab {...shared} />}
        {tab === "my-requests" && <MyRequestsTab {...shared} />}
      </View>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
    </View>
  );
}
