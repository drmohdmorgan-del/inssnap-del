/**
 * Per-role bottom tab navigation for INSSNAPP mobile.
 *
 * Dependency-free: View / Text / Pressable only — no new packages.
 * Each role's tabs share one data container (the role's *Tabs screen),
 * so useShowings/useUnits/enrollments are fetched once per role, not
 * once per tab.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../ui/components";

export interface TabDef {
  id: string;
  label: string;
}

/**
 * The per-role tab map.
 *  Resident: Units | Requests | Showings
 *  Prospect: Discover | My requests
 *  Broker:   Queue | Showings
 */
export const ROLE_TABS: Record<string, TabDef[]> = {
  resident: [
    { id: "units", label: "Units" },
    { id: "requests", label: "Requests" },
    { id: "showings", label: "Showings" },
  ],
  prospect: [
    { id: "discover", label: "Discover" },
    { id: "my-requests", label: "My requests" },
  ],
  broker: [
    { id: "queue", label: "Queue" },
    { id: "showings", label: "Showings" },
  ],
};

export const DEFAULT_TABS: Record<string, string> = {
  resident: "units",
  prospect: "discover",
  broker: "queue",
};

/**
 * Bottom tab bar. Navy-tinted bar; the active tab gets a violet
 * indicator strip and violet label.
 */
export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.label}
          >
            <View style={[styles.indicator, selected && styles.indicatorActive]} />
            <Text style={[styles.label, selected && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#1B1B520D",
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingBottom: 20,
    paddingTop: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  indicator: {
    height: 3,
    width: 40,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginBottom: 6,
  },
  indicatorActive: {
    backgroundColor: theme.brandViolet,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.muted,
  },
  labelActive: {
    color: theme.brandViolet,
    fontWeight: "700",
  },
});

export interface DeepLink {
  role: "resident" | "prospect" | "broker";
  tab: string;
}

/**
 * Parses an `inssnapp://<role>/<tab>` deep link (e.g.
 * `inssnapp://resident/requests`). Returns null for anything that
 * doesn't name a known role and one of that role's tabs — invalid
 * links are ignored, never navigated.
 */
export function parseDeepLink(url: string | null | undefined): DeepLink | null {
  if (!url || typeof url !== "string") return null;
  const match = /^inssnapp:\/\/([^/]+)\/([^/?#]+)/i.exec(url.trim());
  if (!match) return null;
  const role = match[1].toLowerCase();
  const tab = match[2].toLowerCase();
  const tabs = ROLE_TABS[role];
  if (!tabs || !tabs.some((t) => t.id === tab)) return null;
  return { role: role as DeepLink["role"], tab };
}
