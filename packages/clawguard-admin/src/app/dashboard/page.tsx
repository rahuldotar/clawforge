"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton, Skeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getPolicy, queryAudit, getPendingSkills, getUsers, getConnectedClients } from "@/lib/api";
import type { EffectivePolicy, AuditEvent } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [toolCallsAllowed, setToolCallsAllowed] = useState(0);
  const [toolCallsBlocked, setToolCallsBlocked] = useState(0);
  const [onlineClients, setOnlineClients] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    async function load() {
      const auth = getAuth()!;
      const { orgId, accessToken } = auth;

      const [policyData, auditData, skillsData, usersData, clientsData] = await Promise.allSettled([
        getPolicy(orgId, accessToken),
        queryAudit(orgId, accessToken, { limit: "20" }),
        getPendingSkills(orgId, accessToken),
        getUsers(orgId, accessToken),
        getConnectedClients(orgId, accessToken),
      ]);

      if (policyData.status === "fulfilled") setPolicy(policyData.value);
      if (auditData.status === "fulfilled") {
        const events = auditData.value.events;
        setRecentEvents(events);
        setToolCallsAllowed(events.filter((e) => e.outcome === "allowed").length);
        setToolCallsBlocked(events.filter((e) => e.outcome === "blocked").length);
      }
      if (skillsData.status === "fulfilled") setPendingCount(skillsData.value.submissions.length);
      if (usersData.status === "fulfilled") setUserCount(usersData.value.users.length);
      if (clientsData.status === "fulfilled") setOnlineClients(clientsData.value.summary.online);

      setLoading(false);
    }

    load();
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
            <CardSkeleton />
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <StatCard label="Active Users" value={userCount} />
              <StatCard label="Clients Online" value={onlineClients} />
              <StatCard label="Tool Calls Allowed" value={toolCallsAllowed} variant="success" />
              <StatCard label="Tool Calls Blocked" value={toolCallsBlocked} variant="danger" />
              <StatCard label="Pending Reviews" value={pendingCount} variant="warning" />
            </div>

            {/* Kill switch banner */}
            {policy?.killSwitch.active && (
              <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
                <p className="font-semibold text-red-800">Kill Switch Active</p>
                <p className="text-sm text-red-700 mt-1">
                  {policy.killSwitch.message ?? "All agent tool calls are currently blocked."}
                </p>
              </div>
            )}

            {/* Recent audit events */}
            <Card>
              <CardTitle>Recent Activity</CardTitle>
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent events.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Time</th>
                        <th className="pb-2 font-medium">User</th>
                        <th className="pb-2 font-medium">Event</th>
                        <th className="pb-2 font-medium">Tool</th>
                        <th className="pb-2 font-medium">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEvents.slice(0, 10).map((event) => (
                        <tr key={event.id} className="border-b border-border last:border-0">
                          <td className="py-2 text-muted-foreground">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2">{event.userId.slice(0, 8)}...</td>
                          <td className="py-2">{event.eventType}</td>
                          <td className="py-2 font-mono text-xs">{event.toolName ?? "-"}</td>
                          <td className="py-2">
                            <Badge variant={event.outcome === "allowed" ? "success" : "danger"}>
                              {event.outcome}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
