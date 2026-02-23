"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getOrganization, updateOrganization, changePassword } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [audience, setAudience] = useState("");
  const [orgId, setOrgId] = useState("");
  const [createdAt, setCreatedAt] = useState("");

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setOrgId(auth.orgId);

    getOrganization(auth.orgId, auth.accessToken)
      .then((data) => {
        const org = data.organization;
        setOrgName(org.name);
        setCreatedAt(org.createdAt);
        if (org.ssoConfig) {
          setSsoEnabled(true);
          setIssuerUrl(org.ssoConfig.issuerUrl);
          setClientId(org.ssoConfig.clientId);
          setAudience(org.ssoConfig.audience ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave() {
    const auth = getAuth();
    if (!auth) return;
    setSaving(true);

    try {
      const body: {
        name?: string;
        ssoConfig?: { issuerUrl: string; clientId: string; audience?: string } | null;
      } = {};

      body.name = orgName;

      if (ssoEnabled && issuerUrl && clientId) {
        body.ssoConfig = {
          issuerUrl,
          clientId,
          audience: audience || undefined,
        };
      } else if (!ssoEnabled) {
        body.ssoConfig = null;
      }

      await updateOrganization(auth.orgId, auth.accessToken, body);
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    const auth = getAuth();
    if (!auth) return;

    setChangingPassword(true);

    try {
      await changePassword(auth.accessToken, {
        currentPassword,
        newPassword,
      });
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <h2 className="text-2xl font-bold mb-6">Organization Settings</h2>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardTitle>General</CardTitle>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Organization Name</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full max-w-md px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                  />
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Org ID: <code className="font-mono">{orgId}</code></span>
                  <span>Created: {createdAt ? new Date(createdAt).toLocaleDateString() : "-"}</span>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <CardTitle>SSO / OIDC Configuration</CardTitle>
                <Badge variant={ssoEnabled ? "success" : "default"}>
                  {ssoEnabled ? "Configured" : "Not Configured"}
                </Badge>
              </div>
              <div className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ssoEnabled}
                    onChange={(e) => setSsoEnabled(e.target.checked)}
                    className="rounded"
                  />
                  Enable SSO (OIDC)
                </label>

                {ssoEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">Issuer URL *</label>
                      <input
                        value={issuerUrl}
                        onChange={(e) => setIssuerUrl(e.target.value)}
                        placeholder="https://your-org.okta.com"
                        className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Client ID *</label>
                      <input
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="0oa1234567890"
                        className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Audience (optional)</label>
                      <input
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder="api://clawforge"
                        className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                      />
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <button
              onClick={handleSave}
              disabled={saving || !orgName}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>

            <Card>
              <CardTitle>Change Password</CardTitle>
              <form onSubmit={handleChangePassword} className="mt-4 space-y-4 max-w-md">
                <div>
                  <label className="text-sm font-medium block mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                    placeholder="Enter current password"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                    placeholder="Enter new password (min 6 characters)"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                    placeholder="Confirm new password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {changingPassword ? "Changing..." : "Change Password"}
                </button>
              </form>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
