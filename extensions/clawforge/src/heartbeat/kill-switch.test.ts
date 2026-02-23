import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { KillSwitchManager } from "./kill-switch.js";
import type { ToolEnforcerState } from "../policy/tool-enforcer.js";
import type { ClawForgePluginConfig, SessionTokens } from "../types.js";

function makeConfig(overrides?: Partial<ClawForgePluginConfig>): ClawForgePluginConfig {
  return {
    controlPlaneUrl: "https://clawforge.example.com",
    orgId: "org-123",
    heartbeatIntervalMs: 100,
    heartbeatFailureThreshold: 3,
    ...overrides,
  };
}

function makeSession(): SessionTokens {
  return {
    accessToken: "test-token",
    userId: "user-1",
    orgId: "org-123",
  };
}

describe("KillSwitchManager", () => {
  let state: ToolEnforcerState;

  beforeEach(() => {
    state = {
      policy: null,
      killSwitchActive: false,
      killSwitchMessage: undefined,
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("activates kill switch when heartbeat returns killSwitch=true", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        policyVersion: 1,
        killSwitch: true,
        killSwitchMessage: "Shutdown now",
        refreshPolicyNow: false,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const mgr = new KillSwitchManager({
      config: makeConfig(),
      session: makeSession(),
      enforcerState: state,
      logger: mockLogger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(state.killSwitchActive).toBe(true);
    expect(state.killSwitchMessage).toBe("Shutdown now");
  });

  it("deactivates kill switch when heartbeat returns killSwitch=false", async () => {
    state.killSwitchActive = true;
    state.killSwitchMessage = "Was active";

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        policyVersion: 1,
        killSwitch: false,
        refreshPolicyNow: false,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const mgr = new KillSwitchManager({
      config: makeConfig(),
      session: makeSession(),
      enforcerState: state,
      logger: mockLogger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(state.killSwitchActive).toBe(false);
    expect(state.killSwitchMessage).toBeUndefined();
  });

  it("calls onPolicyRefreshNeeded when heartbeat signals refresh", async () => {
    const onRefresh = vi.fn();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        policyVersion: 2,
        killSwitch: false,
        refreshPolicyNow: true,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const mgr = new KillSwitchManager({
      config: makeConfig(),
      session: makeSession(),
      enforcerState: state,
      onPolicyRefreshNeeded: onRefresh,
      logger: mockLogger,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(onRefresh).toHaveBeenCalled();
  });

  it("does nothing when no controlPlaneUrl configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const mgr = new KillSwitchManager({
      config: makeConfig({ controlPlaneUrl: undefined }),
      session: makeSession(),
      enforcerState: state,
    });

    mgr.start();
    await vi.advanceTimersByTimeAsync(150);
    mgr.stop();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
