/**
 * MFA step: consumes the challenge from /api/auth/login with a TOTP code
 * via POST /api/auth/mfa/verify.
 */

import React, { useState } from "react";
import { Text, View } from "react-native";
import type { InssnappClient } from "../api/client";
import { ApiError } from "../api/client";
import type { SessionUser } from "../api/types";
import { Button, Card, LogoMark, Muted, Screen, TextField, theme, Title } from "../ui/components";

export function MfaScreen({
  client,
  challengeId,
  onAuthenticated,
  onCancel,
}: {
  client: InssnappClient;
  challengeId: string;
  onAuthenticated: (user: SessionUser) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!code.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await client.verifyMfa(challengeId, code.trim());
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View
          style={{
            backgroundColor: theme.brandNavy,
            borderRadius: 16,
            padding: 24,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <LogoMark size={56} />
          <Text
            style={{
              color: theme.brandWhite,
              fontSize: 22,
              fontWeight: "800",
              letterSpacing: 2,
              marginTop: 10,
            }}
          >
            INSSNAPP
          </Text>
        </View>
        <Title>Two-step verification</Title>
        <Muted>Your account requires a second step. Enter the code from your authenticator app.</Muted>
        <View style={{ height: 16 }} />
        <Card>
          <TextField
            label="Code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="numeric"
            autoCapitalize="none"
            maxLength={8}
          />
          {error ? (
            <Text style={{ color: theme.ink, fontWeight: "600", marginBottom: 8 }}>{error}</Text>
          ) : null}
          <Button label={busy ? "Verifying…" : "Verify"} onPress={submit} disabled={busy} />
          <Button label="Back to sign-in" kind="ghost" onPress={onCancel} disabled={busy} />
        </Card>
      </View>
    </Screen>
  );
}
