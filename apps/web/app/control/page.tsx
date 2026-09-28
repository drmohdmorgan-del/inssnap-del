"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSession, type User } from "../../lib/session";
import { Nav } from "../../components/Nav";
import { OrgsOverview, OrgsStatCards } from "../../components/OrgsOverview";
import { WorkflowMonitor } from "../../components/WorkflowMonitor";
import { AuditLogViewer } from "../../components/AuditLogViewer";
import { IntegrationStatus } from "../../components/IntegrationStatus";
import { SecurityEvents } from "../../components/SecurityEvents";

export default function ControlPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSession().then((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      // TASK-007: the Control Center is the super-admin surface — strictly
      // inssnapp_admin. Management uses /admin.
      if (u.role !== "inssnapp_admin") {
        router.replace("/admin");
        return;
      }
      setUser(u);
      setLoading(false);
    });
  }, [router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav user={user} isControl={true} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">INSSNAPP Control Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organizations, workflow monitoring, integration health, security, and audit.
          </p>
        </div>

        <div className="space-y-6">
          <OrgsStatCards />

          <OrgsOverview />

          <WorkflowMonitor />

          <div className="grid gap-6 lg:grid-cols-2">
            <IntegrationStatus />
            <SecurityEvents />
          </div>

          <AuditLogViewer />
        </div>
      </main>
    </div>
  );
}
