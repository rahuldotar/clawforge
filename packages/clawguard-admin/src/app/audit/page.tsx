"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { getAuth } from "@/lib/auth";
import { queryAudit } from "@/lib/api";
import type { AuditEvent } from "@/lib/api";

export default function AuditPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUser, setFilterUser] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterTool, setFilterTool] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const loadEvents = useCallback(async () => {
    const auth = getAuth();
    if (!auth) return;

    setLoading(true);
    const params: Record<string, string> = { limit: "100" };
    if (filterUser) params.userId = filterUser;
    if (filterType) params.eventType = filterType;
    if (filterTool) params.toolName = filterTool;
    if (filterOutcome) params.outcome = filterOutcome;
    if (filterFrom) params.from = filterFrom;
    if (filterTo) params.to = filterTo;

    try {
      const data = await queryAudit(auth.orgId, auth.accessToken, params);
      setEvents(data.events);
    } catch {
      // leave events as-is
    }
    setLoading(false);
  }, [filterUser, filterType, filterTool, filterOutcome, filterFrom, filterTo]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadEvents();
  }, [router, loadEvents]);

  function applyAdminFilter() {
    setFilterType("admin_action");
  }

  // Trigger loadEvents when filterType changes to admin_action via the preset button.
  useEffect(() => {
    if (filterType === "admin_action") {
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  function exportCSV() {
    const header = "ID,Timestamp,User,EventType,Tool,Outcome,Session\n";
    const rows = events.map((e) =>
      [e.id, e.timestamp, e.userId, e.eventType, e.toolName ?? "", e.outcome, e.sessionKey ?? ""].join(","),
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <button
            onClick={exportCSV}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-secondary"
          >
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardTitle>Filters</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <input
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              placeholder="User ID"
              className="px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              placeholder="Event type"
              className="px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              value={filterTool}
              onChange={(e) => setFilterTool(e.target.value)}
              placeholder="Tool name"
              className="px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All outcomes</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={loadEvents}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              Apply Filters
            </button>
            <button
              onClick={applyAdminFilter}
              className={`px-4 py-2 rounded-md text-sm font-medium border ${
                filterType === "admin_action"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-secondary"
              }`}
            >
              Admin Actions
            </button>
          </div>
        </Card>

        {/* Events table */}
        <Card>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground">No audit events found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Timestamp</th>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Event</th>
                    <th className="pb-2 font-medium">Tool</th>
                    <th className="pb-2 font-medium">Outcome</th>
                    <th className="pb-2 font-medium">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-border last:border-0">
                      <td className="py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 font-mono text-xs">{event.userId.slice(0, 12)}...</td>
                      <td className="py-2">{event.eventType}</td>
                      <td className="py-2 font-mono text-xs">{event.toolName ?? "-"}</td>
                      <td className="py-2">
                        <Badge variant={event.outcome === "allowed" ? "success" : event.eventType === "admin_action" ? "default" : "danger"}>
                          {event.outcome}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">
                        {event.sessionKey?.slice(0, 8) ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3">
                Showing {events.length} events
              </p>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
