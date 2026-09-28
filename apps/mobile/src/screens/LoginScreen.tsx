/**
 * Sign-in screen. Wires to the real POST /api/auth/login; privileged
 * roles (MFA enrolled) get a 202 challenge and move to the MFA screen.
 * Dev quick-login buttons fill the demo accounts (dev builds only).
 */

import React, { useState } from "react";
import { Text, View } from "react-native";
import type { InssnappClient } from "../api/client";
import { ApiError } from "../api/client";
import type { SessionUser } from "../api/types";
import {
  Body,
  Button,
  Card,
  Muted,
  Screen,
  TextField,
  theme,
  Title,
} from "../ui/components";

const DEV_ACCOUNTS = [
  { label: "Resident", email: "resident@inssnapp.demo" },
  { label: "Prospect", email: "prospect@inssnapp.demo" },
  { label: "Broker", email: "broker@inssnapp.demo" },
];

export function LoginScreen({
  client,
  onAuthenticated,
  onMfaRequired,
}: {
  client: InssnappClient;
  onAuthenticated: (user: SessionUser) => void;
  onMfaRequired: (challengeId: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(givenEmail?: string, givenPassword?: string) {
    const e = (givenEmail ?? email).trim();
    const p = givenPassword ?? password;
    if (!e || !p) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await client.login(e, p);
      if ("mfaRequired" in result) {
        onMfaRequired(result.challengeId);
      } else {
        onAuthenticated(result.user);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Title>INSSNAPP</Title>
        <Body>Real-time showing coordination for occupied units.</Body>
        <View style={{ height: 16 }} />
        <Card>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
          />
          {error ? (
            <Text style={{ color: theme.danger, marginBottom: 8 }}>{error}</Text>
          ) : null}
          <Button label={busy ? "Signing in…" : "Sign in"} onPress={() => submit()} disabled={busy} />
        </Card>
        {__DEV__ ? (
          <Card>
            <Muted>Dev quick sign-in (demo accounts):</Muted>
            {DEV_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                label={`Continue as ${a.label}`}
                kind="secondary"
                onPress={() => submit(a.email, "pw")}
                disabled={busy}
              />
            ))}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
