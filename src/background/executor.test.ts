import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerTask,
  startAllTasks,
  stopAllTasks,
  getTaskState,
  listTasks,
  clearTasks,
} from "./executor.js";
import type { BackgroundTask } from "./types.js";

// Mock the subsystem logger to avoid real logging infrastructure
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
    subsystem: "background:executor",
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  clearTasks();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "test-task",
    name: "Test Task",
    run: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("registerTask", () => {
  it("registers a task and it appears in listTasks", () => {
    const task = makeTask();
    registerTask(task);
    const all = listTasks();
    expect(all).toHaveLength(1);
    expect(all[0].task.id).toBe("test-task");
    expect(all[0].status).toBe("idle");
  });

  it("is a no-op if the same task id is registered again (duplicate registration)", () => {
    const task1 = makeTask({ id: "dup", name: "Task One" });
    const task2 = makeTask({ id: "dup", name: "Task Two" });
    registerTask(task1);
    registerTask(task2);
    const all = listTasks();
    expect(all).toHaveLength(1);
    // The first registration wins
    expect(all[0].task.name).toBe("Task One");
  });

  it("stores task with idle status", () => {
    const task = makeTask({ id: "my-task" });
    registerTask(task);
    const state = getTaskState("my-task");
    expect(state).toBeDefined();
    expect(state?.status).toBe("idle");
  });
});

describe("startAllTasks - runOnce", () => {
  it("runs a runOnce task after startAllTasks is called", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, message: "done" });
    const task = makeTask({ id: "once-task", runOnce: true, run });
    registerTask(task);
    startAllTasks();

    // Advance timers so setTimeout(fn, 0) fires
    await vi.runAllTimersAsync();

    expect(run).toHaveBeenCalledTimes(1);
    const state = getTaskState("once-task");
    expect(state?.status).toBe("done");
    expect(state?.lastResult).toEqual({ ok: true, message: "done" });
  });

  it("sets status to failed when runOnce task returns ok: false", async () => {
    const run = vi.fn().mockResolvedValue({ ok: false, message: "something went wrong" });
    const task = makeTask({ id: "fail-task", runOnce: true, run });
    registerTask(task);
    startAllTasks();
    await vi.runAllTimersAsync();

    const state = getTaskState("fail-task");
    expect(state?.status).toBe("failed");
  });

  it("sets status to failed when runOnce task throws", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"));
    const task = makeTask({ id: "throw-task", runOnce: true, run });
    registerTask(task);
    startAllTasks();
    await vi.runAllTimersAsync();

    const state = getTaskState("throw-task");
    expect(state?.status).toBe("failed");
    expect(state?.lastResult?.message).toContain("boom");
  });
});

describe("startAllTasks - interval task", () => {
  it("runs an interval task immediately and then on each interval", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const task = makeTask({ id: "interval-task", intervalMs: 1000, run });
    registerTask(task);
    startAllTasks();

    // Immediate run (void runTask fires synchronously then awaits)
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    // Advance one interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("stopAllTasks", () => {
  it("clears timers and resets status to idle", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const task = makeTask({ id: "stop-task", intervalMs: 500, run });
    registerTask(task);
    startAllTasks();
    await vi.advanceTimersByTimeAsync(0);

    stopAllTasks();

    const state = getTaskState("stop-task");
    expect(state?.timer).toBeUndefined();
    expect(state?.status).toBe("idle");

    // After stopping, advancing time should not trigger more runs
    const callsBefore = run.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(run.mock.calls.length).toBe(callsBefore);
  });
});

describe("clearTasks", () => {
  it("empties the task list after clearing", () => {
    registerTask(makeTask({ id: "task-a" }));
    registerTask(makeTask({ id: "task-b" }));
    expect(listTasks()).toHaveLength(2);

    clearTasks();

    expect(listTasks()).toHaveLength(0);
  });

  it("returns undefined from getTaskState after clearing", () => {
    registerTask(makeTask({ id: "gone-task" }));
    clearTasks();
    expect(getTaskState("gone-task")).toBeUndefined();
  });

  it("allows re-registration after clearing", () => {
    const task = makeTask({ id: "re-reg" });
    registerTask(task);
    clearTasks();
    registerTask(task);
    expect(listTasks()).toHaveLength(1);
  });
});

describe("getTaskState", () => {
  it("returns undefined for unregistered task id", () => {
    expect(getTaskState("nonexistent")).toBeUndefined();
  });

  it("returns the state for a registered task", () => {
    const task = makeTask({ id: "known-task" });
    registerTask(task);
    const state = getTaskState("known-task");
    expect(state).toBeDefined();
    expect(state?.task).toBe(task);
  });
});
