/**
 * Session persistence via expo-secure-store (keychain / encrypted prefs).
 *
 * The adapter interface keeps the auth flow testable without native
 * modules; the Expo implementation below is what the app wires in.
 * The secure store is imported dynamically so unit tests (node) never
 * touch native modules.
 */

export interface SessionStorage {
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  clear(): Promise<void>;
}

const SESSION_KEY = "inssnapp_session_value";

export async function createSecureSessionStorage(): Promise<SessionStorage> {
  const SecureStore = await import("expo-secure-store");
  return {
    load: () => SecureStore.getItemAsync(SESSION_KEY),
    save: (value: string) => SecureStore.setItemAsync(SESSION_KEY, value),
    clear: () => SecureStore.deleteItemAsync(SESSION_KEY),
  };
}

/** In-memory fallback (used when SecureStore is unavailable). */
export function createMemorySessionStorage(): SessionStorage {
  let value: string | null = null;
  return {
    load: async () => value,
    save: async (v: string) => {
      value = v;
    },
    clear: async () => {
      value = null;
    },
  };
}
