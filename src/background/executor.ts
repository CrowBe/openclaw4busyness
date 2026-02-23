import { createSubsystemLogger } from "../logging/subsystem.js";
import type { BackgroundTask, BackgroundTaskState } from "./types.js";

const log = createSubsystemLogger("background:executor");
const tasks = new Map<string, BackgroundTaskState>();

export function registerTask(task: BackgroundTask): void {
  if (tasks.has(task.id)) {
    log.warn(`task already registered: ${task.id}`);
    return;
  }
  tasks.set(task.id, { task, status: "idle" });
}

export function startAllTasks(): void {
  for (const state of tasks.values()) {
    scheduleTask(state);
  }
}

export function stopAllTasks(): void {
  for (const state of tasks.values()) {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = undefined;
    }
    state.status = "idle";
  }
}

export function getTaskState(id: string): BackgroundTaskState | undefined {
  return tasks.get(id);
}

export function listTasks(): BackgroundTaskState[] {
  return [...tasks.values()];
}

export function clearTasks(): void {
  stopAllTasks();
  tasks.clear();
}

function scheduleTask(state: BackgroundTaskState): void {
  const { task } = state;
  if (task.runOnce) {
    const timer = setTimeout(() => runTask(state), 0);
    state.timer = timer;
  } else if (task.intervalMs) {
    const timer = setInterval(() => runTask(state), task.intervalMs);
    state.timer = timer;
    // Run immediately too
    void runTask(state);
  }
}

async function runTask(state: BackgroundTaskState): Promise<void> {
  if (state.status === "running") {
    return;
  }
  state.status = "running";
  state.lastRunAt = Date.now();
  try {
    const result = await state.task.run();
    state.lastResult = result;
    state.status = result.ok ? "done" : "failed";
    if (!result.ok) {
      log.warn(`task ${state.task.name} failed: ${result.message}`);
    }
  } catch (err) {
    state.status = "failed";
    state.lastResult = { ok: false, message: String(err) };
    log.error(`task ${state.task.name} threw: ${String(err)}`);
  }
}
