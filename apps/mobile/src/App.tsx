/**
 * INSSNAPP mobile — app shell (TASK-004/005/006).
 *
 * One Expo codebase, three role-based experiences. The role comes from
 * the real login (POST /api/auth/login → session); the shell routes to
 * the Resident, Prospect, or Broker experience. Management and
 * INSSNAPP-admin accounts get an honest "use the web portal" screen —
 * the mobile app is built for the three field roles.
 */

import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { InssnappClient } from "./api/client";
import { resolveApiBaseUrl } from "./api/config";
import {
  createMemorySessionStorage,
  createSecureSessionStorage,
  type SessionStorage,
} from "./api/session-storage";
import type { SessionUser } from "./api/types";
import { parseDeepLink, type DeepLink } from "./nav/tabs";
import { BrokerTabs } from "./screens/BrokerTabs";
import { LoginScreen } from "./screens/LoginScreen";
import { MfaScreen } from "./screens/MfaScreen";
import { ProspectTabs } from "./screens/ProspectTabs";
import { ResidentTabs } from "./screens/ResidentTabs";
import { Body, Button, Card, LoadingView, Muted, Screen, Title, theme } from "./ui/components";

type Boot =
  | { stage: "booting" }
  | { stage: "login" }
  | { stage: "mfa"; challengeId: string }
  | { stage: "app"; user: SessionUser };

/**
 * Base URL for the web backend.
 * EXPO_PUBLIC_API_URL wins (required on a physical device — use the
 * dev machine's LAN IP, e.g. http://192.168.1.42:3000). Otherwise the
 * Metro host is reused with port 3000, falling back to localhost.
 */
function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/+$/, "");
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host) return `http://${host}:3000`;
  }
  return resolveApiBaseUrl();
}

function UnsupportedRole({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Title>INSSNAPP mobile</Title>
        <Card>
          <Body>
            The mobile app is built for residents, prospects, and brokers. Your {user.role} account
            is served by the Management portal and Control Center on the web.
          </Body>
          <Muted>Signed in as {user.email}</Muted>
          <Button label="Sign out" kind="secondary" onPress={onSignOut} />
        </Card>
      </View>
    </Screen>
  );
}

export default function App() {
  const [boot, setBoot] = useState<Boot>({ stage: "booting" });
  const [storage, setStorage] = useState<SessionStorage | null>(null);
  const [baseUrl] = useState(apiBaseUrl);
  const client = useMemo(() => new InssnappClient({ baseUrl }), [baseUrl]);
  /**
   * Deep-link state. A link that arrives while logged out waits in
   * pendingLink; on a successful login it becomes the initial tab only
   * when its role matches the signed-in user. Invalid links (unknown
   * role/tab) are rejected by parseDeepLink and ignored.
   */
  const [pendingLink, setPendingLink] = useState<DeepLink | null>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);

  const enterApp = useCallback(
    (user: SessionUser) => {
      setPendingLink((pending) => {
        if (pending && pending.role === user.role) setInitialTab(pending.tab);
        return null;
      });
      setBoot({ stage: "app", user });
    },
    [],
  );

  const persistSession = useCallback(
    async (user: SessionUser) => {
      const value = client.getSessionValue();
      if (value && storage) {
        try {
          await storage.save(value);
        } catch {
          /* session stays memory-only — the user is still signed in */
        }
      }
      enterApp(user);
    },
    [client, storage, enterApp],
  );

  const signOut = useCallback(async () => {
    try {
      await client.logout();
    } catch {
      /* logout is best-effort; the local session is cleared regardless */
    }
    if (storage) {
      try {
        await storage.clear();
      } catch {
        /* ignore */
      }
    }
    setBoot({ stage: "login" });
  }, [client, storage]);

  useEffect(() => {
    const handleUrl = (url: string | null | undefined) => {
      const link = parseDeepLink(url);
      if (!link) return;
      setBoot((b) => {
        if (b.stage === "app" && b.user.role === link.role) {
          setInitialTab(link.tab);
        } else {
          // Logged out (or wrong role): park the link until a matching
          // login. Auth is never bypassed — the app still lands on login.
          setPendingLink(link);
        }
        return b;
      });
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {
      /* no launch URL — normal cold start */
    });
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let store: SessionStorage;
      try {
        store = await createSecureSessionStorage();
      } catch {
        store = createMemorySessionStorage();
      }
      if (cancelled) return;
      setStorage(store);
      const saved = await store.load().catch(() => null);
      if (saved) {
        client.setSessionValue(saved);
        try {
          const user = await client.me();
          if (!cancelled) enterApp(user);
          return;
        } catch {
          client.clearSession();
          await store.clear().catch(() => null);
        }
      }
      if (!cancelled) setBoot({ stage: "login" });
    })();
    return () => {
      cancelled = true;
    };
  }, [client, enterApp]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style="dark" />
      {boot.stage === "booting" && <LoadingView message="Starting INSSNAPP…" />}
      {boot.stage === "login" && (
        <LoginScreen
          client={client}
          onAuthenticated={persistSession}
          onMfaRequired={(challengeId) => setBoot({ stage: "mfa", challengeId })}
        />
      )}
      {boot.stage === "mfa" && (
        <MfaScreen
          client={client}
          challengeId={boot.challengeId}
          onAuthenticated={persistSession}
          onCancel={() => setBoot({ stage: "login" })}
        />
      )}
      {boot.stage === "app" && boot.user.role === "resident" && (
        <ResidentTabs client={client} user={boot.user} onSignOut={signOut} initialTab={initialTab} />
      )}
      {boot.stage === "app" && boot.user.role === "prospect" && (
        <ProspectTabs client={client} user={boot.user} onSignOut={signOut} initialTab={initialTab} />
      )}
      {boot.stage === "app" && boot.user.role === "broker" && (
        <BrokerTabs client={client} user={boot.user} onSignOut={signOut} initialTab={initialTab} />
      )}
      {boot.stage === "app" &&
        (boot.user.role === "management" || boot.user.role === "inssnapp_admin") && (
          <UnsupportedRole user={boot.user} onSignOut={signOut} />
        )}
    </View>
  );
}
