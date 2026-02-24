import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTasks, getTaskState, listTasks, startAllTasks } from "./executor.js";
import { isHitlRequired, registerBackgroundTask } from "./registry.js";
import type { OutputType } from "./registry.js";

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(),
    isEnabled: vi.fn(() => false),
    subsystem: "background:registry",
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  clearTasks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isHitlRequired", () => {
  it("returns false for internal output", () => {
    expect(isHitlRequired("internal")).toBe(false);
  });

  it("returns true for client_facing output", () => {
    expect(isHitlRequired("client_facing")).toBe(true);
  });

  it("returns true for financial output", () => {
    expect(isHitlRequired("financial")).toBe(true);
  });

  it("returns true for system_modify output", () => {
    expect(isHitlRequired("system_modify")).toBe(true);
  });
});

describe("registerBackgroundTask", () => {
  it("registers a task in the executor", () => {
    registerBackgroundTask({
      id: "test-bg",
      name: "Test Background Task",
      outputType: "internal",
      runOnce: true,
      run: vi.fn().mockResolvedValue({ ok: true }),
    });

    expect(listTasks()).toHaveLength(1);
    expect(getTaskState("test-bg")).toBeDefined();
  });

  it("does not add hitlRequired flag to internal task results", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, message: "done" });
    registerBackgroundTask({
      id: "internal-task",
      name: "Internal Task",
      outputType: "internal",
      runOnce: true,
      run,
    });

    startAllTasks();
    await vi.runAllTimersAsync();

    const state = getTaskState("internal-task");
    expect(state?.lastResult?.ok).toBe(true);
    // Internal tasks should not have hitlRequired in the result data
    const data = state?.lastResult?.data as Record<string, unknown> | undefined;
    expect(data?.hitlRequired).toBeUndefined();
  });

  it.each(["client_facing", "financial", "system_modify"] as OutputType[])(
    "adds hitlRequired flag to %s task results",
    async (outputType) => {
      const run = vi.fn().mockResolvedValue({ ok: true, message: "done", data: { foo: "bar" } });
      registerBackgroundTask({
        id: `hitl-${outputType}`,
        name: `HITL ${outputType}`,
        outputType,
        runOnce: true,
        run,
      });

      startAllTasks();
      await vi.runAllTimersAsync();

      const state = getTaskState(`hitl-${outputType}`);
      expect(state?.lastResult?.ok).toBe(true);
      const data = state?.lastResult?.data as Record<string, unknown>;
      expect(data?.hitlRequired).toBe(true);
      expect(data?.outputType).toBe(outputType);
      // Original data should be preserved
      expect(data?.foo).toBe("bar");
    },
  );

  it("does not add hitlRequired flag when HITL task fails", async () => {
    const run = vi.fn().mockResolvedValue({ ok: false, message: "failed" });
    registerBackgroundTask({
      id: "fail-hitl",
      name: "Failing HITL Task",
      outputType: "financial",
      runOnce: true,
      run,
    });

    startAllTasks();
    await vi.runAllTimersAsync();

    const state = getTaskState("fail-hitl");
    // Failed results should not be tagged for HITL
    const data = state?.lastResult?.data as Record<string, unknown> | undefined;
    expect(data?.hitlRequired).toBeUndefined();
  });
});
