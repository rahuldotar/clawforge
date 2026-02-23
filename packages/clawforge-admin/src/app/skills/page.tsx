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
  getPendingSkills,
  reviewSkill,
  getApprovedSkills,
  revokeSkillApproval,
  resubmitSkill,
  getSkillHistory,
} from "@/lib/api";
import type { SkillSubmission, ApprovedSkill } from "@/lib/api";

export default function SkillsPage() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<SkillSubmission[]>([]);
  const [approved, setApproved] = useState<ApprovedSkill[]>([]);
  const [history, setHistory] = useState<ApprovedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "history">("pending");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    const auth = getAuth()!;
    const [pendingRes, approvedRes, historyRes] = await Promise.allSettled([
      getPendingSkills(auth.orgId, auth.accessToken),
      getApprovedSkills(auth.orgId, auth.accessToken),
      getSkillHistory(auth.orgId, auth.accessToken),
    ]);
    if (pendingRes.status === "fulfilled") setPending(pendingRes.value.submissions);
    if (approvedRes.status === "fulfilled") setApproved(approvedRes.value.skills);
    if (historyRes.status === "fulfilled") setHistory(historyRes.value.skills);
    setLoading(false);
  }

  async function handleReview(id: string, status: string) {
    const auth = getAuth();
    if (!auth) return;

    setReviewingId(id);
    try {
      await reviewSkill(auth.orgId, id, auth.accessToken, { status });
      toast.success(`Skill ${status === "rejected" ? "rejected" : "approved"}.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  }

  async function handleRevoke(skillId: string) {
    const auth = getAuth();
    if (!auth) return;

    setRevokingId(skillId);
    try {
      await revokeSkillApproval(auth.orgId, skillId, auth.accessToken);
      toast.success("Skill approval revoked.");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleResubmit(submissionId: string) {
    const auth = getAuth();
    if (!auth) return;

    setResubmittingId(submissionId);
    try {
      await resubmitSkill(auth.orgId, submissionId, auth.accessToken);
      toast.success("Skill resubmitted for review.");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resubmit failed");
    } finally {
      setResubmittingId(null);
    }
  }

  function renderScanResults(submission: SkillSubmission) {
    const scan = submission.scanResults;
    if (!scan) return <p className="text-sm text-muted-foreground">No scan results available.</p>;

    return (
      <div className="space-y-3">
        <div className="flex gap-4 text-sm">
          <span>Files scanned: {scan.scannedFiles}</span>
          <span className="text-red-600">Critical: {scan.critical}</span>
          <span className="text-amber-600">Warnings: {scan.warn}</span>
          <span className="text-blue-600">Info: {scan.info}</span>
        </div>
        {scan.findings.length > 0 && (
          <div className="space-y-2">
            {scan.findings.map((f, i) => (
              <div key={i} className="text-xs border border-border rounded p-2 bg-secondary/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={f.severity === "critical" ? "danger" : f.severity === "warn" ? "warning" : "info"}>
                    {f.severity}
                  </Badge>
                  <span className="font-medium">{f.ruleId}</span>
                  <span className="text-muted-foreground">{f.file}:{f.line}</span>
                </div>
                <p>{f.message}</p>
                <pre className="mt-1 text-muted-foreground overflow-x-auto">{f.evidence}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <h2 className="text-2xl font-bold mb-6">Skill Review</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "pending"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab("approved")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "approved"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Approved ({approved.length})
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            History ({history.length})
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : tab === "pending" ? (
          pending.length === 0 ? (
            <p className="text-muted-foreground">No pending skill submissions.</p>
          ) : (
            <div className="space-y-4">
              {pending.map((submission) => (
                <Card key={submission.id}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-semibold text-base">{submission.skillName}</h3>
                      {submission.skillKey && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{submission.skillKey}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Submitted {new Date(submission.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
                        className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-secondary"
                      >
                        {expandedId === submission.id ? "Hide Details" : "Details"}
                      </button>
                      <button
                        onClick={() => handleReview(submission.id, "approved-org")}
                        disabled={reviewingId === submission.id}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve (Org)
                      </button>
                      <button
                        onClick={() => handleReview(submission.id, "approved-self")}
                        disabled={reviewingId === submission.id}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        Approve (Self)
                      </button>
                      <button
                        onClick={() => handleReview(submission.id, "rejected")}
                        disabled={reviewingId === submission.id}
                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {expandedId === submission.id && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {submission.manifestContent && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">SKILL.md</h4>
                          <pre className="text-xs bg-secondary rounded p-3 overflow-x-auto whitespace-pre-wrap">
                            {submission.manifestContent}
                          </pre>
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-medium mb-1">Security Scan</h4>
                        {renderScanResults(submission)}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        ) : tab === "approved" ? (
          approved.length === 0 ? (
            <p className="text-muted-foreground">No approved skills.</p>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Skill Name</th>
                      <th className="pb-2 font-medium">Key</th>
                      <th className="pb-2 font-medium">Scope</th>
                      <th className="pb-2 font-medium">Version</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map((skill) => (
                      <tr key={skill.id} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium">{skill.skillName}</td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">{skill.skillKey}</td>
                        <td className="py-2">
                          <Badge variant={skill.scope === "org" ? "success" : "info"}>
                            {skill.scope}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">v{skill.version}</td>
                        <td className="py-2">
                          <Badge variant="success">Active</Badge>
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => handleRevoke(skill.id)}
                            disabled={revokingId === skill.id}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                          >
                            {revokingId === skill.id ? "Revoking..." : "Revoke"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        ) : (
          /* History tab */
          history.length === 0 ? (
            <p className="text-muted-foreground">No skill approval history.</p>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Skill Name</th>
                      <th className="pb-2 font-medium">Key</th>
                      <th className="pb-2 font-medium">Scope</th>
                      <th className="pb-2 font-medium">Version</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Approved</th>
                      <th className="pb-2 font-medium">Revoked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((skill) => (
                      <tr key={skill.id} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium">{skill.skillName}</td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">{skill.skillKey}</td>
                        <td className="py-2">
                          <Badge variant={skill.scope === "org" ? "success" : "info"}>
                            {skill.scope}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">v{skill.version}</td>
                        <td className="py-2">
                          {skill.revokedAt ? (
                            <Badge variant="danger">Revoked</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {new Date(skill.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {skill.revokedAt ? new Date(skill.revokedAt).toLocaleDateString() : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        )}
      </main>
    </div>
  );
}
