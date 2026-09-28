/**
 * Shared UI primitives for the three role experiences.
 * Dependency-free React Native (View / Text / StyleSheet only).
 *
 * Brand palette (strict — no off-palette hex anywhere):
 *   navy #0A0A2E · deep navy #1B1B52 · violet #7B2FF7 ·
 *   violet light #9D4EDD · white
 */

import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ShowingState } from "../api/types";
import { STATE_LABELS } from "../flows/common";

export const theme = {
  /* INSSNAPP brand palette — the only colors in the app. */
  brandNavy: "#0A0A2E",
  brandNavyLight: "#1B1B52",
  brandViolet: "#7B2FF7",
  brandVioletLight: "#9D4EDD",
  brandWhite: "#FFFFFF",
  /* Derived (alpha tints of the brand colors only). */
  bg: "#FFFFFF",
  ink: "#0A0A2E",
  muted: "#1B1B52B3",
  card: "#FFFFFF",
  border: "#1B1B521F",
  secondaryBg: "#1B1B5214",
  badgeBg: "#7B2FF71F",
  trackOff: "#1B1B5233",
  radius: 12,
};

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

/**
 * Official INSSNAPP puzzle-piece logo (final artwork — do not alter).
 * The lockup is designed for dark backgrounds, so it renders on a
 * deep-navy tile. Accessibility label keeps it meaningful to screen readers.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: theme.brandNavy,
        overflow: "hidden",
      }}
      accessibilityRole="image"
      accessibilityLabel="INSSNAPP"
    >
      <Image
        source={require("../assets/inssnapp-logo.png")}
        style={{ width: size, height: size, resizeMode: "contain" }}
        accessibilityLabel="INSSNAPP"
      />
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Body({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/**
 * State is conveyed by the label text; the badge stays palette-only
 * (violet tint background, navy text) for every state.
 */
export function StateBadge({ state }: { state: ShowingState }) {
  return (
    <View style={[styles.badge, { backgroundColor: theme.badgeBg }]}>
      <Text style={[styles.badgeText, { color: theme.ink }]}>{STATE_LABELS[state]}</Text>
    </View>
  );
}

type ButtonKind = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === "primary" && styles.buttonPrimary,
        kind === "secondary" && styles.buttonSecondary,
        kind === "danger" && styles.buttonDanger,
        kind === "ghost" && styles.buttonGhost,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          kind === "primary" && styles.buttonTextPrimary,
          kind === "ghost" && styles.buttonTextGhost,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  autoCapitalize?: "none" | "sentences";
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.muted}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.trackOff, true: theme.brandViolet }}
        thumbColor={theme.brandWhite}
      />
    </View>
  );
}

export function LoadingView({ message = "Loading…" }: { message?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.brandViolet} />
      <Text style={[styles.muted, { marginTop: 12 }]}>{message}</Text>
    </View>
  );
}

/**
 * Honest error state: names the failure and offers a retry. Used for
 * server errors and for the offline case (ApiError.isNetworkError).
 */
export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Something didn’t work</Text>
      <Text style={[styles.muted, styles.errorMessage]}>{message}</Text>
      <Button label="Try again" onPress={onRetry} kind="secondary" />
    </View>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

/** 1–5 star picker for the post-completion rating step. */
export function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (stars: number) => void;
}) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} style={styles.star}>
          <Text style={[styles.starText, n <= value && styles.starActive]}>
            {n <= value ? "★" : "☆"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink, marginBottom: 4 },
  subtitle: { fontSize: 16, fontWeight: "600", color: theme.ink, marginBottom: 8 },
  body: { fontSize: 15, color: theme.ink, lineHeight: 22 },
  muted: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonPrimary: { backgroundColor: theme.brandViolet },
  buttonSecondary: { backgroundColor: theme.secondaryBg },
  buttonDanger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.brandNavy,
  },
  buttonGhost: { backgroundColor: "transparent" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontSize: 16, fontWeight: "700", color: theme.ink },
  buttonTextPrimary: { color: theme.brandWhite },
  buttonTextGhost: { color: theme.brandViolet },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: theme.ink, marginBottom: 6 },
  input: {
    backgroundColor: theme.brandWhite,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.ink,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleText: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 17, fontWeight: "700", color: theme.ink, marginBottom: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: "700", color: theme.ink, marginBottom: 8 },
  errorMessage: { textAlign: "center", marginBottom: 16 },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: 24,
    alignItems: "center",
    backgroundColor: theme.card,
    marginBottom: 12,
  },
  stars: { flexDirection: "row", justifyContent: "center", marginVertical: 12 },
  star: { padding: 6 },
  starText: { fontSize: 40, color: theme.trackOff },
  starActive: { color: theme.brandViolet },
});
