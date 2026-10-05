import { Suspense } from "react";
import LoginForm from "./LoginForm";

/**
 * Server component. The login page never renders demo credentials —
 * no demo account list, no demo password, no TOTP secrets — in any build.
 * Local/dev pilot testing uses the TEST MODE bar (explicit opt-in via
 * INSSNAPP_TEST_MODE=1), never disclosed credentials.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-400">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
