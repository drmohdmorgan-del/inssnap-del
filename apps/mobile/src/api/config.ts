/**
 * API base URL configuration.
 *
 * Priority:
 * 1. EXPO_PUBLIC_API_URL (set at bundle time — use your machine's LAN IP
 *    when running on a physical device, e.g. http://192.168.1.42:3000)
 * 2. Expo manifest host (dev convenience: the Metro host with port 3000)
 * 3. http://localhost:3000 (iOS simulator / web)
 */

function readPublicEnv(name: string): string | undefined {
  try {
    const v = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function resolveApiBaseUrl(): string {
  const fromEnv = readPublicEnv("EXPO_PUBLIC_API_URL");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  // Best-effort Metro-host fallback is applied by the App layer via
  // expo-constants when available; keep this module dependency-free.
  return "http://localhost:3000";
}
