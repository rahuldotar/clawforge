/**
 * Tool policy enforcer for ClawForge.
 * Implements the before_tool_call hook that blocks denied tools and enforces
 * org policy allow/deny lists and the kill switch.
 */

import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
} from "openclaw/plugin-sdk";
import type { OrgPolicy } from "../types.js";
import type { AuditLogger } from "../audit/audit-logger.js";

/**
 * Normalize a tool name for comparison (lowercase, trim, resolve aliases).
 * Mirrors the normalizeToolName logic from src/agents/tool-policy.ts.
 */
const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

/**
 * Well-known tool groups, mirroring src/agents/tool-policy.ts.
 */
const TOOL_GROUPS: Record<string, string[]> = {
  "group:memory": ["memory_search", "memory_get"],
  "group:web": ["web_search", "web_fetch"],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:runtime": ["exec", "process"],
  "group:sessions": [
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "subagents",
    "session_status",
  ],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["cron", "gateway"],
  "group:messaging": ["message"],
  "group:nodes": ["nodes"],
};

function expandGroups(list: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const entry of list) {
    const normalized = normalizeToolName(entry);
    const group = TOOL_GROUPS[normalized];
    if (group) {
      for (const tool of group) {
        expanded.add(tool);
      }
    } else {
      expanded.add(normalized);
    }
  }
  return expanded;
}

export type ToolEnforcerState = {
  policy: OrgPolicy | null;
  killSwitchActive: boolean;
  killSwitchMessage?: string;
};

/**
 * Create the before_tool_call hook handler for org policy enforcement.
 */
export function createToolEnforcerHook(
  state: ToolEnforcerState,
  auditLogger: AuditLogger,
): (
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
) => PluginHookBeforeToolCallResult | undefined {
  return (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ): PluginHookBeforeToolCallResult | undefined => {
    const toolName = normalizeToolName(event.toolName);

    // 1. Kill switch check
    if (state.killSwitchActive) {
      const reason =
        state.killSwitchMessage ?? "ClawForge: All tool calls blocked by organization kill switch";
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "blocked",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: "kill_switch" },
      });
      return { block: true, blockReason: reason };
    }

    const policy = state.policy;
    if (!policy) {
      // No policy loaded - allow by default
      auditLogger.enqueue({
        eventType: "tool_call_attempt",
        toolName,
        outcome: "allowed",
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        metadata: { reason: "no_policy" },
      });
      return undefined;
    }

    // 2. Deny list check
    if (policy.tools.deny && policy.tools.deny.length > 0) {
      const denySet = expandGroups(policy.tools.deny);
      if (denySet.has(toolName)) {
        auditLogger.enqueue({
          eventType: "tool_call_attempt",
          toolName,
          outcome: "blocked",
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          metadata: { reason: "deny_list" },
        });
        return {
          block: true,
          blockReason: `ClawForge: Tool "${event.toolName}" is blocked by organization policy`,
        };
      }
    }

    // 3. Allow list check
    if (policy.tools.allow && policy.tools.allow.length > 0) {
      const allowSet = expandGroups(policy.tools.allow);
      if (!allowSet.has(toolName)) {
        auditLogger.enqueue({
          eventType: "tool_call_attempt",
          toolName,
          outcome: "blocked",
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          metadata: { reason: "not_in_allowlist" },
        });
        return {
          block: true,
          blockReason: `ClawForge: Tool "${event.toolName}" is not in the organization's allowed tools list`,
        };
      }
    }

    // 4. Allowed
    auditLogger.enqueue({
      eventType: "tool_call_attempt",
      toolName,
      outcome: "allowed",
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
    });

    return undefined;
  };
}
