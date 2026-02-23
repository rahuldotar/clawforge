/**
 * Audit logger for ClawForge.
 * Buffers audit events and ships them to the control plane in batches.
 * Persists unshipped events to disk for crash resilience.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AuditEvent, AuditEventType, ClawForgePluginConfig, SessionTokens } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const BUFFER_FILE = path.join(CLAWFORGE_DIR, "audit-buffer.jsonl");

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

export type AuditLoggerEnqueueParams = {
  eventType: AuditEventType;
  toolName?: string;
  outcome: AuditEvent["outcome"];
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
};

export class AuditLogger {
  private buffer: AuditEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private controlPlaneUrl: string;
  private orgId: string;
  private userId: string;
  private accessToken: string;
  private auditLevel: "full" | "metadata" | "off";
  private logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  constructor(params: {
    config: ClawForgePluginConfig;
    session: SessionTokens;
    auditLevel?: "full" | "metadata" | "off";
    logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  }) {
    this.controlPlaneUrl = params.config.controlPlaneUrl ?? "";
    this.orgId = params.session.orgId;
    this.userId = params.session.userId;
    this.accessToken = params.session.accessToken;
    this.batchSize = params.config.auditBatchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = params.config.auditFlushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.auditLevel = params.auditLevel ?? "metadata";
    this.logger = params.logger;

    // Load any unshipped events from disk.
    this.loadPersistedBuffer();
  }

  /**
   * Start the periodic flush timer.
   */
  start(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger?.warn(`Audit flush failed: ${String(err)}`);
      });
    }, this.flushIntervalMs);
    // Allow the process to exit even if the timer is still running.
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop the periodic flush timer and flush remaining events.
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Update the access token (e.g. after a session refresh).
   */
  updateAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Update the audit level from policy refresh.
   */
  updateAuditLevel(level: "full" | "metadata" | "off"): void {
    this.auditLevel = level;
  }

  /**
   * Enqueue an audit event.
   */
  enqueue(params: AuditLoggerEnqueueParams): void {
    if (this.auditLevel === "off") {
      return;
    }

    const event: AuditEvent = {
      userId: this.userId,
      orgId: this.orgId,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      eventType: params.eventType,
      toolName: params.toolName,
      timestamp: Date.now(),
      outcome: params.outcome,
      metadata: this.auditLevel === "full" ? params.metadata : undefined,
    };

    this.buffer.push(event);

    if (this.buffer.length >= this.batchSize) {
      this.flush().catch((err) => {
        this.logger?.warn(`Audit flush failed: ${String(err)}`);
      });
    }
  }

  /**
   * Flush buffered events to the control plane.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const batch = this.buffer.splice(0);

    if (!this.controlPlaneUrl) {
      // No control plane configured; persist to disk.
      this.persistBuffer(batch);
      return;
    }

    try {
      const url = `${this.controlPlaneUrl}/api/v1/audit/${encodeURIComponent(this.orgId)}/events`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events: batch }),
      });

      if (!response.ok) {
        // Put events back and persist for retry.
        this.logger?.warn(`Audit event submission failed (${response.status})`);
        this.buffer.unshift(...batch);
        this.persistBuffer(this.buffer);
      } else {
        this.logger?.info(`Shipped ${batch.length} audit events`);
        // Clear persisted buffer on success.
        this.clearPersistedBuffer();
      }
    } catch (err) {
      this.logger?.warn(`Audit event submission error: ${String(err)}`);
      this.buffer.unshift(...batch);
      this.persistBuffer(this.buffer);
    }
  }

  private persistBuffer(events: AuditEvent[]): void {
    try {
      fs.mkdirSync(CLAWFORGE_DIR, { recursive: true });
      const lines = events.map((e) => JSON.stringify(e)).join("\n");
      fs.writeFileSync(BUFFER_FILE, lines + "\n", { mode: 0o600 });
    } catch {
      // Best effort.
    }
  }

  private clearPersistedBuffer(): void {
    try {
      fs.unlinkSync(BUFFER_FILE);
    } catch {
      // Ignore.
    }
  }

  private loadPersistedBuffer(): void {
    try {
      const raw = fs.readFileSync(BUFFER_FILE, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          this.buffer.push(JSON.parse(line) as AuditEvent);
        } catch {
          // Skip malformed lines.
        }
      }
    } catch {
      // No persisted buffer.
    }
  }
}
