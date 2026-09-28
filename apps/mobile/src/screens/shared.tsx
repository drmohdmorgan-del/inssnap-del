/**
 * Shared building blocks for the role home screens.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { InssnappClient } from "../api/client";
import { ApiError } from "../api/client";
import type { SessionUser, Showing } from "../api/types";
import { STATE_LABELS } from "../flows/common";
import {
  Body,
  Button,
  Card,
  ErrorView,
  LoadingView,
  LogoMark,
  Muted,
  StarPicker,
  StateBadge,
  Subtitle,
  TextField,
  theme,
} from "../ui/components";

/** Friendly message for an action failure — never invents a success. */
export function actionMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetworkError) return err.message;
    if (err.status === 401) return "Your session expired. Sign in again.";
    if (err.status === 403) return "You’re not allowed to do that with this account.";
    if (err.status === 404) return "That record wasn’t found — it may belong to another organization.";
    if (err.status === 409)
      return "That was already done (or someone else just did it). Refresh to see the latest status.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export interface ScreenProps {
  client: InssnappClient;
  user: SessionUser;
  onSignOut: () => void;
}

/**
 * Polls the showings list on an interval plus manual refresh.
 * Returns honest loading / error / data states — no placeholder data.
 */
export function useShowings(client: InssnappClient, intervalMs = 8000) {
  const [showings, setShowings] = useState<Showing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const list = await client.listShowings();
        setShowings(list);
        setError(null);
      } catch (err) {
        if (showings === null) setError(actionMessage(err));
        // Background poll failures keep the last good data on screen.
      } finally {
        setRefreshing(false);
      }
    },
    [client, showings],
  );

  useEffect(() => {
    load();
    timer.current = setInterval(() => load(true), intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  return { showings, error, refreshing, reload: () => load() };
}

export function Header({
  title,
  user,
  onSignOut,
}: {
  title: string;
  user: SessionUser;
  onSignOut: () => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <LogoMark size={40} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: theme.ink }}>{title}</Text>
            <Muted>
              {user.fullName} · {user.email}
            </Muted>
          </View>
        </View>
        <Button label="Sign out" kind="ghost" onPress={onSignOut} />
      </View>
    </View>
  );
}

export function ShowingCard({
  showing,
  unitLabel,
  children,
}: {
  showing: Showing;
  unitLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Subtitle>{unitLabel ? `Unit ${unitLabel}` : `Showing ${showing.id.slice(0, 8)}…`}</Subtitle>
      </View>
      <Body>{STATE_LABELS[showing.state]}</Body>
      {showing.outcome ? <Muted>Outcome: {showing.outcome}</Muted> : null}
      <StateBadge state={showing.state} />
      {children}
    </Card>
  );
}

/**
 * Post-completion rating sheet (resident + broker). Submits a real rating
 * to POST /api/showings/[id]/rating; a 409 means it was already rated.
 */
export function RatingSheet({
  showing,
  client,
  onClose,
}: {
  showing: Showing;
  client: InssnappClient;
  onClose: (rated: boolean) => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (stars === 0) {
      setError("Pick a star rating first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await client.rateShowing(showing.id, stars, comment.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(actionMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Subtitle>Rate this showing</Subtitle>
      {done ? (
        <View>
          <Body>Thanks — your rating was recorded.</Body>
          <Button label="Done" onPress={() => onClose(true)} />
        </View>
      ) : (
        <View>
          <Muted>How did it go? Your rating is visible to management only.</Muted>
          <StarPicker value={stars} onChange={setStars} />
          <TextField
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            placeholder="Anything worth noting…"
            maxLength={500}
          />
          {error ? <Muted>{error}</Muted> : null}
          <Button label={busy ? "Submitting…" : "Submit rating"} onPress={submit} disabled={busy} />
          <Button label="Skip" kind="ghost" onPress={() => onClose(false)} disabled={busy} />
        </View>
      )}
    </Card>
  );
}

/** Unit catalog for label lookup (unitId → label). Fails soft — labels are cosmetic. */
export function useUnits(client: InssnappClient) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    client
      .listUnits()
      .then((units) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const u of units) map[u.id] = u.label;
        setLabels(map);
      })
      .catch(() => {
        /* labels are cosmetic; showing ids still render */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
  return labels;
}

export function RoleScreen({  client,
  user,
  onSignOut,
  title,
  children,
}: ScreenProps & { title: string; children: React.ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 16, paddingBottom: 40 }}>
        <Header title={title} user={user} onSignOut={onSignOut} />
        {children}
      </View>
    </ScrollView>
  );
}

export { ErrorView, LoadingView };
