"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, StatCard } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton, Skeleton } from "@/components/skeleton";
import { getAuth } from "@/lib/auth";
import { getConnectedClients } from "@/lib/api";
import type { ConnectedClient, ClientsSummary } from "@/lib/api";

export default function ConnectedClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [summary, setSummary] = useState<ClientsSummary>({ total: 0, online: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadClients();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadClients, 30000);
    return () => clearInterval(interval);
  }, [router]);

  async function loadClients() {
    const auth = getAuth();
    if (!auth) return;
    try {
      const data = await getConnectedClients(auth.orgId, auth.accessToken);
      setClients(data.clients);
      setSummary(data.summary);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  const filtered = filter === "all" ? clients : clients.filter((c) => c.status === filter);

  function formatLastSeen(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <h2 className="text-2xl font-bold mb-6">Connected Clients</h2>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
            <CardSkeleton />
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard label="Total Clients" value={summary.total} />
              <StatCard label="Online" value={summary.online} variant="success" />
              <StatCard label="Offline" value={summary.offline} variant="danger" />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
              {(["all", "online", "offline"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                    filter === f
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f} ({f === "all" ? summary.total : f === "online" ? summary.online : summary.offline})
                </button>
              ))}
            </div>

            {/* Clients table */}
            <Card>
              {filtered.length === 0 ? (
                <p className="text-muted-foreground">No clients found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">User</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Client Version</th>
                        <th className="pb-2 font-medium">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((client) => (
                        <tr key={client.userId} className="border-b border-border last:border-0">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-2.5 h-2.5 rounded-full ${
                                  client.status === "online" ? "bg-green-500" : "bg-gray-400"
                                }`}
                              />
                              <Badge variant={client.status === "online" ? "success" : "default"}>
                                {client.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2 font-medium">{client.name ?? "-"}</td>
                          <td className="py-2 text-muted-foreground">{client.email}</td>
                          <td className="py-2">
                            <Badge variant={client.role === "admin" ? "info" : "default"}>
                              {client.role}
                            </Badge>
                          </td>
                          <td className="py-2 font-mono text-xs text-muted-foreground">
                            {client.clientVersion ?? "-"}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatLastSeen(client.lastHeartbeatAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">Auto-refreshes every 30 seconds</p>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
