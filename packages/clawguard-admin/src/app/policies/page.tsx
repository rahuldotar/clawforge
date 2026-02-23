"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card, CardTitle } from "@/components/card";
import { Badge } from "@/components/badge";
import { CardSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import { getPolicy, updatePolicy } from "@/lib/api";

const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:web": ["web_search", "web_fetch"],
  "group:runtime": ["exec", "process"],
  "group:memory": ["memory_search", "memory_get"],
  "group:sessions": ["sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "subagents", "session_status"],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["cron", "gateway"],
  "group:messaging": ["message"],
  "group:nodes": ["nodes"],
};

const ALL_TOOLS = [
  "read", "write", "edit", "apply_patch", "glob", "grep",
  "exec", "process", "bash",
  "web_search", "web_fetch",
  "memory_search", "memory_get",
  "browser", "canvas",
  "message", "cron", "gateway", "nodes",
  "sessions_list", "sessions_history", "sessions_send",
  "sessions_spawn", "subagents", "session_status",
  ...Object.keys(TOOL_GROUPS),
];

type Conflict = { tool: string; reason: string };

function getConflicts(allowList: string[], denyList: string[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Expand groups to individual tools
  function expand(name: string): string[] {
    return TOOL_GROUPS[name] ? TOOL_GROUPS[name] : [name];
  }

  const expandedAllow = new Set(allowList.flatMap(expand));
  const expandedDeny = new Set(denyList.flatMap(expand));

  // Direct matches: same tool in both lists
  for (const item of allowList) {
    if (denyList.includes(item)) {
      conflicts.push({ tool: item, reason: `"${item}" appears in both allow and deny lists` });
    }
  }

  // Group in deny overlapping with individual tools in allow
  for (const denyItem of denyList) {
    if (TOOL_GROUPS[denyItem]) {
      const groupTools = TOOL_GROUPS[denyItem];
      for (const tool of groupTools) {
        if (allowList.includes(tool)) {
          conflicts.push({ tool, reason: `"${tool}" is allowed individually but denied via ${denyItem}` });
        }
      }
    }
  }

  // Group in allow overlapping with individual tools in deny
  for (const allowItem of allowList) {
    if (TOOL_GROUPS[allowItem]) {
      const groupTools = TOOL_GROUPS[allowItem];
      for (const tool of groupTools) {
        if (denyList.includes(tool)) {
          conflicts.push({ tool, reason: `"${tool}" is denied individually but allowed via ${allowItem}` });
        }
      }
    }
  }

  // Group overlap: a group in allow and a different group in deny that share tools
  for (const denyItem of denyList) {
    if (TOOL_GROUPS[denyItem]) {
      for (const allowItem of allowList) {
        if (TOOL_GROUPS[allowItem] && denyItem !== allowItem) {
          const overlap = TOOL_GROUPS[denyItem].filter((t) => TOOL_GROUPS[allowItem].includes(t));
          for (const tool of overlap) {
            if (!conflicts.some((c) => c.tool === tool)) {
              conflicts.push({ tool, reason: `"${tool}" is in both ${allowItem} (allow) and ${denyItem} (deny)` });
            }
          }
        }
      }
    }
  }

  // Deduplicate by tool name
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    if (seen.has(c.tool)) return false;
    seen.add(c.tool);
    return true;
  });
}

function getEffectivePolicy(allowList: string[], denyList: string[]) {
  function expand(name: string): string[] {
    return TOOL_GROUPS[name] ? TOOL_GROUPS[name] : [name];
  }

  const allIndividualTools = ALL_TOOLS.filter((t) => !t.startsWith("group:"));
  const blocked = new Set(denyList.flatMap(expand));
  const allowed = new Set(allowList.flatMap(expand));

  const blockedTools = allIndividualTools.filter((t) => blocked.has(t));
  const allowedTools = allowList.length > 0
    ? allIndividualTools.filter((t) => allowed.has(t) && !blocked.has(t))
    : allIndividualTools.filter((t) => !blocked.has(t));
  const implicitlyBlocked = allowList.length > 0
    ? allIndividualTools.filter((t) => !allowed.has(t) && !blocked.has(t))
    : [];

  return { blockedTools, allowedTools, implicitlyBlocked };
}

export default function PoliciesPage() {
  const router = useRouter();
  const toast = useToast();
  const [denyList, setDenyList] = useState<string[]>([]);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [auditLevel, setAuditLevel] = useState("metadata");
  const [profile, setProfile] = useState("");
  const [newDeny, setNewDeny] = useState("");
  const [newAllow, setNewAllow] = useState("");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }

    getPolicy(auth.orgId, auth.accessToken).then((policy) => {
      setDenyList(policy.tools.deny ?? []);
      setAllowList(policy.tools.allow ?? []);
      setProfile(policy.tools.profile ?? "");
      setAuditLevel(policy.auditLevel);
      setVersion(policy.version);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  function addItem(list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput("");
  }

  function removeItem(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index));
  }

  function expandGroup(name: string): string[] {
    return TOOL_GROUPS[name] ?? [name];
  }

  function addToCatalog(tool: string, target: "allow" | "deny") {
    if (target === "allow" && !allowList.includes(tool)) {
      setAllowList([...allowList, tool]);
    } else if (target === "deny" && !denyList.includes(tool)) {
      setDenyList([...denyList, tool]);
    }
  }

  async function handleSave() {
    const auth = getAuth();
    if (!auth) return;

    setSaving(true);

    try {
      await updatePolicy(auth.orgId, auth.accessToken, {
        tools: {
          deny: denyList.length > 0 ? denyList : undefined,
          allow: allowList.length > 0 ? allowList : undefined,
          profile: profile || undefined,
        },
        auditLevel,
      });
      setVersion((v) => v + 1);
      toast.success("Policy saved successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const conflicts = getConflicts(allowList, denyList);
  const effective = getEffectivePolicy(allowList, denyList);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Policy Editor</h2>
          <Badge>v{version}</Badge>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Deny List */}
            <Card>
              <CardTitle>Denied Tools</CardTitle>
              <p className="text-sm text-muted-foreground mb-3">
                Tools in this list will be blocked for all users. Supports group names (e.g. group:fs).
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  value={newDeny}
                  onChange={(e) => setNewDeny(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(denyList, setDenyList, newDeny, setNewDeny))}
                  placeholder="e.g. bash, group:exec"
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => addItem(denyList, setDenyList, newDeny, setNewDeny)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {denyList.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-800 text-xs font-medium">
                    {item}
                    {TOOL_GROUPS[item] && (
                      <span className="text-red-500 ml-1">({expandGroup(item).join(", ")})</span>
                    )}
                    <button onClick={() => removeItem(denyList, setDenyList, i)} className="ml-1 hover:text-red-600">&times;</button>
                  </span>
                ))}
                {denyList.length === 0 && <span className="text-sm text-muted-foreground">No denied tools</span>}
              </div>
            </Card>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="font-semibold text-amber-800 mb-2">
                  Policy Conflicts Detected ({conflicts.length})
                </p>
                <ul className="space-y-1">
                  {conflicts.map((c, i) => (
                    <li key={i} className="text-sm text-amber-700">
                      <span className="font-mono font-medium">{c.tool}</span>: {c.reason}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-600 mt-2">
                  Conflicts are non-blocking. Deny rules take precedence over allow rules.
                </p>
              </div>
            )}

            {/* Allow List */}
            <Card>
              <CardTitle>Allowed Tools</CardTitle>
              <p className="text-sm text-muted-foreground mb-3">
                If set, only these tools will be permitted. Leave empty to allow all (except denied).
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  value={newAllow}
                  onChange={(e) => setNewAllow(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem(allowList, setAllowList, newAllow, setNewAllow))}
                  placeholder="e.g. read, write, group:fs"
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => addItem(allowList, setAllowList, newAllow, setNewAllow)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allowList.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-50 text-green-800 text-xs font-medium">
                    {item}
                    {TOOL_GROUPS[item] && (
                      <span className="text-green-500 ml-1">({expandGroup(item).join(", ")})</span>
                    )}
                    <button onClick={() => removeItem(allowList, setAllowList, i)} className="ml-1 hover:text-green-600">&times;</button>
                  </span>
                ))}
                {allowList.length === 0 && <span className="text-sm text-muted-foreground">All tools allowed (except denied)</span>}
              </div>
            </Card>

            {/* Audit Level & Profile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardTitle>Audit Level</CardTitle>
                <select
                  value={auditLevel}
                  onChange={(e) => setAuditLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="full">Full (all events + LLM I/O)</option>
                  <option value="metadata">Metadata (events only)</option>
                  <option value="off">Off</option>
                </select>
              </Card>

              <Card>
                <CardTitle>Tool Profile</CardTitle>
                <input
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="e.g. developer, readonly"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Card>
            </div>

            {/* Tool Reference */}
            <Card>
              <button
                onClick={() => setShowCatalog(!showCatalog)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle>Tool Reference</CardTitle>
                <span className="text-muted-foreground text-sm">{showCatalog ? "Hide" : "Show"}</span>
              </button>
              {showCatalog && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Expands To</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Groups first */}
                      {Object.entries(TOOL_GROUPS).map(([group, tools]) => (
                        <tr key={group} className="border-b border-border last:border-0">
                          <td className="py-2 font-mono text-xs font-medium">{group}</td>
                          <td className="py-2">
                            <Badge variant="info">group</Badge>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{tools.join(", ")}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => addToCatalog(group, "allow")}
                                className="px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 hover:bg-green-100"
                              >
                                +Allow
                              </button>
                              <button
                                onClick={() => addToCatalog(group, "deny")}
                                className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                              >
                                +Deny
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {/* Individual tools */}
                      {ALL_TOOLS.filter((t) => !t.startsWith("group:")).map((tool) => (
                        <tr key={tool} className="border-b border-border last:border-0">
                          <td className="py-2 font-mono text-xs font-medium">{tool}</td>
                          <td className="py-2">
                            <Badge>tool</Badge>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">-</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => addToCatalog(tool, "allow")}
                                className="px-2 py-0.5 text-xs rounded bg-green-50 text-green-700 hover:bg-green-100"
                              >
                                +Allow
                              </button>
                              <button
                                onClick={() => addToCatalog(tool, "deny")}
                                className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                              >
                                +Deny
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Effective Policy Preview */}
            <Card>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle>Preview Effective Policy</CardTitle>
                <span className="text-muted-foreground text-sm">{showPreview ? "Hide" : "Show"}</span>
              </button>
              {showPreview && (
                <div className="mt-4 space-y-4">
                  {/* Blocked */}
                  <div>
                    <h4 className="text-sm font-medium text-red-700 mb-2">
                      Blocked Tools ({effective.blockedTools.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {effective.blockedTools.length > 0 ? effective.blockedTools.map((t) => (
                        <span key={t} className="px-2 py-0.5 text-xs rounded-md bg-red-50 text-red-800 font-mono">
                          {t}
                        </span>
                      )) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>

                  {/* Allowed */}
                  <div>
                    <h4 className="text-sm font-medium text-green-700 mb-2">
                      Allowed Tools ({effective.allowedTools.length})
                      {allowList.length === 0 && " - All (except blocked)"}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {effective.allowedTools.map((t) => (
                        <span key={t} className="px-2 py-0.5 text-xs rounded-md bg-green-50 text-green-800 font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Implicitly Blocked */}
                  {effective.implicitlyBlocked.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-amber-700 mb-2">
                        Implicitly Blocked ({effective.implicitlyBlocked.length})
                      </h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        Not in the allow list, so these tools are blocked by omission.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {effective.implicitlyBlocked.map((t) => (
                          <span key={t} className="px-2 py-0.5 text-xs rounded-md bg-amber-50 text-amber-800 font-mono">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Save */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Policy"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
