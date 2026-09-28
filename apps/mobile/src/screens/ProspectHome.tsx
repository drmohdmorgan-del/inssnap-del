/**
 * Prospect experience (TASK-005) — one-screen workflow:
 * eligible unit discovery → unit detail → request showing →
 * live request status → confirmed/showing status → Apply / Watch / Decline.
 */

import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import type { Showing, Unit } from "../api/types";
import {
  discoverableUnits,
  prospectActions,
  prospectActiveRequests,
  unitMatchesQuery,
} from "../flows/prospect";
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

export function ProspectHome({ client, user, onSignOut }: ScreenProps) {
  const { showings, error, reload } = useShowings(client);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Unit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    await Promise.all([loadUnits(), (async () => reload())()]);
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
  if (showings === null || units === null) return <LoadingView message="Finding available units…" />;

  const available = discoverableUnits(units).filter((u) => unitMatchesQuery(u, query));
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
        <Header title="Find a home" user={user} onSignOut={onSignOut} />
        {actionError ? (
          <Card>
            <Body>{actionError}</Body>
          </Card>
        ) : null}

        {/* Live request status */}
        {(active.length > 0 || completed.length > 0) && (
          <View>
            <Title>My requests</Title>
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
                        onPress={() => submitOutcome(s, a.toUpperCase() as "APPLY" | "WATCH" | "DECLINE")}
                        disabled={busy !== null}
                      />
                    </View>
                  ))}
                </View>
              </ShowingCard>
            ))}
          </View>
        )}

        {/* Eligible unit discovery */}
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
                  <Button label="Cancel" kind="ghost" onPress={() => setSelected(null)} disabled={busy !== null} />
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
