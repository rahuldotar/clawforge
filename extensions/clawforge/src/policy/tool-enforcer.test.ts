import { describe, it, expect, beforeEach, vi } from "vitest";
import { createToolEnforcerHook, type ToolEnforcerState } from "./tool-enforcer.js";
import type { AuditLogger } from "../audit/audit-logger.js";
import type { OrgPolicy } from "../types.js";

function makePolicy(overrides?: Partial<OrgPolicy>): OrgPolicy {
  return {
    version: 1,
    tools: {},
    skills: { approved: [], requireApproval: false },
    killSwitch: { active: false },
    auditLevel: "metadata",
    ...overrides,
  };
}

function makeAuditLogger(): AuditLogger {
  return { enqueue: vi.fn() } as unknown as AuditLogger;
}

function makeCtx(overrides?: Record<string, unknown>) {
  return {
    agentId: "test-agent",
    sessionKey: "test-session",
    toolName: "exec",
    ...overrides,
  };
}

describe("tool-enforcer", () => {
  let state: ToolEnforcerState;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    state = {
      policy: null,
      killSwitchActive: false,
      killSwitchMessage: undefined,
    };
    auditLogger = makeAuditLogger();
  });

  describe("kill switch", () => {
    it("blocks all tools when kill switch is active", () => {
      state.killSwitchActive = true;
      state.killSwitchMessage = "Emergency shutdown";
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "exec", params: {} }, makeCtx());

      expect(result).toEqual({
        block: true,
        blockReason: "Emergency shutdown",
      });
      expect((auditLogger.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
        eventType: "tool_call_attempt",
        outcome: "blocked",
        metadata: { reason: "kill_switch" },
      });
    });

    it("uses default message when killSwitchMessage is undefined", () => {
      state.killSwitchActive = true;
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "read", params: {} }, makeCtx());

      expect(result?.block).toBe(true);
      expect(result?.blockReason).toContain("kill switch");
    });
  });

  describe("no policy loaded", () => {
    it("allows all tools when no policy is set", () => {
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "exec", params: {} }, makeCtx());

      expect(result).toBeUndefined();
      expect((auditLogger.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
        outcome: "allowed",
        metadata: { reason: "no_policy" },
      });
    });
  });

  describe("deny list", () => {
    it("blocks tools in the deny list", () => {
      state.policy = makePolicy({ tools: { deny: ["exec", "write"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "exec", params: {} }, makeCtx());

      expect(result).toEqual({
        block: true,
        blockReason: 'ClawForge: Tool "exec" is blocked by organization policy',
      });
    });

    it("allows tools not in the deny list", () => {
      state.policy = makePolicy({ tools: { deny: ["exec"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "read", params: {} }, makeCtx());

      expect(result).toBeUndefined();
    });

    it("expands tool groups in deny list", () => {
      state.policy = makePolicy({ tools: { deny: ["group:runtime"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      expect(hook({ toolName: "exec", params: {} }, makeCtx())).toEqual(
        expect.objectContaining({ block: true }),
      );
      expect(hook({ toolName: "process", params: {} }, makeCtx())).toEqual(
        expect.objectContaining({ block: true }),
      );
      expect(hook({ toolName: "read", params: {} }, makeCtx())).toBeUndefined();
    });

    it("normalizes tool names (bash -> exec)", () => {
      state.policy = makePolicy({ tools: { deny: ["exec"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "bash", params: {} }, makeCtx());

      expect(result?.block).toBe(true);
    });
  });

  describe("allow list", () => {
    it("allows tools in the allow list", () => {
      state.policy = makePolicy({ tools: { allow: ["read", "write"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "read", params: {} }, makeCtx());

      expect(result).toBeUndefined();
    });

    it("blocks tools not in the allow list", () => {
      state.policy = makePolicy({ tools: { allow: ["read", "write"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "exec", params: {} }, makeCtx());

      expect(result).toEqual({
        block: true,
        blockReason: 'ClawForge: Tool "exec" is not in the organization\'s allowed tools list',
      });
    });

    it("expands tool groups in allow list", () => {
      state.policy = makePolicy({ tools: { allow: ["group:fs"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      expect(hook({ toolName: "read", params: {} }, makeCtx())).toBeUndefined();
      expect(hook({ toolName: "write", params: {} }, makeCtx())).toBeUndefined();
      expect(hook({ toolName: "edit", params: {} }, makeCtx())).toBeUndefined();
      expect(hook({ toolName: "exec", params: {} }, makeCtx())).toEqual(
        expect.objectContaining({ block: true }),
      );
    });
  });

  describe("deny overrides allow", () => {
    it("blocks a tool that is both allowed and denied", () => {
      state.policy = makePolicy({
        tools: { allow: ["read", "exec"], deny: ["exec"] },
      });
      const hook = createToolEnforcerHook(state, auditLogger);

      const result = hook({ toolName: "exec", params: {} }, makeCtx());

      // Deny is checked first, so exec should be blocked.
      expect(result?.block).toBe(true);
    });
  });

  describe("audit logging", () => {
    it("logs allowed tool calls", () => {
      state.policy = makePolicy();
      const hook = createToolEnforcerHook(state, auditLogger);

      hook({ toolName: "read", params: { file: "/tmp/x" } }, makeCtx());

      expect(auditLogger.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "tool_call_attempt",
          toolName: "read",
          outcome: "allowed",
          agentId: "test-agent",
          sessionKey: "test-session",
        }),
      );
    });

    it("logs blocked tool calls with reason", () => {
      state.policy = makePolicy({ tools: { deny: ["exec"] } });
      const hook = createToolEnforcerHook(state, auditLogger);

      hook({ toolName: "exec", params: {} }, makeCtx());

      expect(auditLogger.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "tool_call_attempt",
          toolName: "exec",
          outcome: "blocked",
          metadata: { reason: "deny_list" },
        }),
      );
    });
  });
});
