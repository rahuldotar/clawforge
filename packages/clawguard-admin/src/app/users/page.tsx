"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getUsers, createUser, updateUser, deleteUser } from "@/lib/api";
import type { OrgUser } from "@/lib/api";

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [router]);

  function loadUsers() {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    getUsers(auth.orgId, auth.accessToken)
      .then((data) => setUsers(data.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleInvite() {
    const auth = getAuth();
    if (!auth) return;
    setInviting(true);
    try {
      await createUser(auth.orgId, auth.accessToken, {
        email: inviteEmail,
        name: inviteName || undefined,
        role: inviteRole,
        password: invitePassword || undefined,
      });
      toast.success(`User ${inviteEmail} created.`);
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("user");
      setInvitePassword("");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const auth = getAuth();
    if (!auth) return;
    try {
      await updateUser(auth.orgId, userId, auth.accessToken, { role: newRole });
      toast.success("Role updated.");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleDelete(userId: string, email: string) {
    const auth = getAuth();
    if (!auth) return;
    if (!confirm(`Remove ${email} from the organization? This action cannot be undone.`)) return;
    try {
      await deleteUser(auth.orgId, userId, auth.accessToken);
      toast.success(`User ${email} removed.`);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  const auth = getAuth();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Users</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{users.length} total</span>
            <button
              onClick={() => setShowInvite(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              Invite User
            </button>
          </div>
        </div>

        {showInvite && (
          <Card className="mb-6">
            <CardTitle>Invite User</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-sm font-medium block mb-1">Email *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Password (optional)</label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 bg-secondary rounded-md text-sm border border-border"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {inviting ? "Creating..." : "Create User"}
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm"
              >
                Cancel
              </button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
          </div>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground">No users found.</p>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Last Seen</th>
                    <th className="pb-2 font-medium">Joined</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border last:border-0">
                      <td className="py-3 font-medium">{user.email}</td>
                      <td className="py-3 text-muted-foreground">{user.name ?? "-"}</td>
                      <td className="py-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="bg-secondary px-2 py-1 rounded text-sm border border-border"
                          disabled={user.id === auth?.userId}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="py-3 text-muted-foreground">{formatDate(user.lastSeenAt)}</td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {user.id !== auth?.userId && (
                          <button
                            onClick={() => handleDelete(user.id, user.email)}
                            className="text-red-500 hover:text-red-400 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
