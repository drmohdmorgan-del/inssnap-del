import { Suspense } from "react";
import LoginForm from "./LoginForm";

/**
 * Server component: decides once, at request time, whether demo credentials
 * may be shown. Demo hints are dev-only — with DATABASE_URL set the app runs
 * against production data and the demo section stays hidden.
 */
export default function LoginPage() {
  const showDemo = !process.env.DATABASE_URL;
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-400">Loading…</p>
        </main>
      }
    >
      <LoginForm showDemo={showDemo} />
    </Suspense>
  );
}
