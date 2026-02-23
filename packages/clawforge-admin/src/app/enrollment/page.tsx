"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import {
  getEnrollmentTokens,
  createEnrollmentToken,
  revokeEnrollmentToken,
} from "@/lib/api";
import type { EnrollmentToken } from "@/lib/api";

export default function EnrollmentPage() {
  const router = useRouter();
  const toast = useToast();
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresIn, setExpiresIn] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTokens();
  }, [router]);

  function loadTokens() {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    getEnrollmentTokens(auth.orgId, auth.accessToken)
      .then((data) => setTokens(data.tokens))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    const auth = getAuth();
    if (!auth) return;
    setCreating(true);
    try {
      const body: { label?: string; expiresAt?: string; maxUses?: number } = {};
      if (label.trim()) body.label = label.trim();
      if (maxUses) body.maxUses = parseInt(maxUses, 10);
      if (expiresIn) {
        const hours = parseInt(expiresIn, 10);
        body.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      }
      const result = await createEnrollmentToken(auth.orgId, auth.accessToken, body);
      setNewToken(result.token);
      setShowCreate(false);
      setLabel("");
      setMaxUses("");
      setExpiresIn("");
      toast.success("Enrollment token created.");
      loadTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    const auth = getAuth();
    if (!auth) return;
    if (!confirm("Revoke this enrollment token? It will no longer accept new enrollments.")) return;
    try {
      await revokeEnrollmentToken(auth.orgId, tokenId, auth.accessToken);
      toast.success("Token revoked.");
      loadTokens();
    } catch {
      toast.error("Failed to revoke token.");
    }
  }

  function copyToken() {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Enrollment Tokens</h2>
          <button
            onClick={() => { setShowCreate(true); setNewToken(null); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            Create Token
          </button>
        </div>

        {newToken && (
          <Card className="mb-6 border-green-500/30 bg-green-500/5">
            <CardTitle>New Token Created</CardTitle>
            <p className="text-sm text-muted-foreground mb-2">
              Copy this token now. It will not be shown again in full.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-secondary px-3 py-2 rounded text-sm font-mono break-all">
                {newToken}
              </code>
              <button
                onClick={copyToken}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </Card>
        )}

        {showCreate && (
          <Card className="mb-6">
            <CardTitle>Create Enrollment Token</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="text-sm font-medium block mb-1">Label (optional)</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Engineering team"
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Max Uses (optional)</label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Expires In Hours (optional)</label>
                <input
                  type="number"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  placeholder="Never"
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm"
              >
                Cancel
              </button>
            </div>
          </Card>
        )}

        {loading ? (
          <CardSkeleton />
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground">No active enrollment tokens. Create one to onboard employees.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Label</th>
                    <th className="pb-2 font-medium">Token</th>
                    <th className="pb-2 font-medium">Usage</th>
                    <th className="pb-2 font-medium">Expires</th>
                    <th className="pb-2 font-medium">Created</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => {
                    const isExpired = t.expiresAt && new Date(t.expiresAt) < new Date();
                    const isMaxed = t.maxUses !== null && t.maxUses !== undefined && t.usedCount >= t.maxUses;
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0">
                        <td className="py-3 font-medium">{t.label || "-"}</td>
                        <td className="py-3 font-mono text-xs text-muted-foreground">
                          {t.token.slice(0, 12)}...
                        </td>
                        <td className="py-3">
                          <Badge variant={isMaxed ? "danger" : "default"}>
                            {t.usedCount}{t.maxUses != null ? `/${t.maxUses}` : ""} used
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {t.expiresAt ? (
                            <Badge variant={isExpired ? "danger" : "default"}>
                              {isExpired ? "Expired" : new Date(t.expiresAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            "Never"
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => handleRevoke(t.id)}
                            className="text-red-500 hover:text-red-400 text-sm"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
