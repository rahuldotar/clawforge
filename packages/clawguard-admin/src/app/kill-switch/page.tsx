"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getPolicy, setKillSwitch, getUsers } from "@/lib/api";

export default function KillSwitchPage() {
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<boolean>(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    async function load() {
      const auth = getAuth()!;
      const [policyRes, usersRes] = await Promise.allSettled([
        getPolicy(auth.orgId, auth.accessToken),
        getUsers(auth.orgId, auth.accessToken),
      ]);
      if (policyRes.status === "fulfilled") {
        setActive(policyRes.value.killSwitch.active);
        setMessage(policyRes.value.killSwitch.message ?? "");
      }
      if (usersRes.status === "fulfilled") {
        setUserCount(usersRes.value.users.length);
      }
      setLoading(false);
    }

    load();
  }, [router]);

  function requestToggle(newState: boolean) {
    setPendingAction(newState);
    setShowConfirm(true);
  }

  async function confirmToggle() {
    const auth = getAuth();
    if (!auth) return;

    setShowConfirm(false);
    setToggling(true);

    try {
      await setKillSwitch(auth.orgId, auth.accessToken, pendingAction, message || undefined);
      setActive(pendingAction);
      toast.success(
        pendingAction
          ? "Kill switch activated. All agent tool calls are now blocked."
          : "Kill switch deactivated. Normal operations resumed.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update kill switch");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <h2 className="text-2xl font-bold mb-6">Kill Switch</h2>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status */}
            <Card>
              <div className="flex items-center gap-4">
                <div
                  className={`w-4 h-4 rounded-full ${
                    active ? "bg-red-500 animate-pulse" : "bg-green-500"
                  }`}
                />
                <div>
                  <h3 className="text-lg font-semibold">
                    {active ? "Kill Switch is ACTIVE" : "Kill Switch is OFF"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {active
                      ? "All agent tool calls are currently blocked across the organization."
                      : "Agents are operating normally under policy rules."}
                  </p>
                </div>
              </div>
            </Card>

            {/* Impact */}
            <Card>
              <CardTitle>Impact</CardTitle>
              <p className="text-sm text-muted-foreground">
                {active ? "Currently affecting" : "Will affect"}{" "}
                <span className="font-bold text-foreground">{userCount}</span> user{userCount !== 1 ? "s" : ""} in this
                organization.
              </p>
            </Card>

            {/* Message */}
            <Card>
              <CardTitle>Custom Message</CardTitle>
              <p className="text-sm text-muted-foreground mb-3">
                This message will be shown to users when their tool calls are blocked.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Emergency maintenance in progress. All agent operations are temporarily suspended."
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </Card>

            {/* Toggle button */}
            <div>
              {active ? (
                <button
                  onClick={() => requestToggle(false)}
                  disabled={toggling}
                  className="px-6 py-3 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {toggling ? "Updating..." : "Deactivate Kill Switch"}
                </button>
              ) : (
                <button
                  onClick={() => requestToggle(true)}
                  disabled={toggling}
                  className="px-6 py-3 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {toggling ? "Updating..." : "Activate Kill Switch"}
                </button>
              )}
            </div>

            {/* Confirmation dialog */}
            {showConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-card rounded-lg border border-border p-6 shadow-lg max-w-md w-full mx-4">
                  <h3 className="text-lg font-semibold mb-2">
                    {pendingAction ? "Activate Kill Switch?" : "Deactivate Kill Switch?"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {pendingAction
                      ? `This will immediately block all agent tool calls for ${userCount} user${userCount !== 1 ? "s" : ""}. Are you sure?`
                      : "This will restore normal agent operations under existing policy rules."}
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="px-4 py-2 text-sm border border-border rounded-md hover:bg-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmToggle}
                      className={`px-4 py-2 text-sm text-white rounded-md ${
                        pendingAction
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-green-600 hover:bg-green-700"
                      }`}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
