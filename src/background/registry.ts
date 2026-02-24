import { createSubsystemLogger } from "../logging/subsystem.js";
import { registerTask } from "./executor.js";
import type { BackgroundTask, BackgroundTaskFn } from "./types.js";

const log = createSubsystemLogger("background:registry");

/**
 * Output type classification for background tasks.
 * Determines whether the task's output requires HITL approval.
 */
export type OutputType = "internal" | "client_facing" | "financial" | "system_modify";

const HITL_REQUIRED: Record<OutputType, boolean> = {
  internal: false,
  client_facing: true,
  financial: true,
  system_modify: true,
};

export type BackgroundTaskDefinition = {
  id: string;
  name: string;
  outputType: OutputType;
  intervalMs?: number;
  runOnce?: boolean;
  run: BackgroundTaskFn;
};

/**
 * Register a background task with output-type-aware HITL enforcement.
 *
 * When the task's output type requires HITL (client_facing, financial,
 * system_modify), the task's run function is wrapped so its result
 * includes a `hitlRequired` flag. The caller (or the HITL middleware)
 * is responsible for routing the result through the approval queue.
 *
 * Internal tasks execute without HITL gating.
 */
export function registerBackgroundTask(def: BackgroundTaskDefinition): void {
  const requiresHitl = HITL_REQUIRED[def.outputType];

  const wrappedRun: BackgroundTaskFn = async () => {
    const result = await def.run();
    if (requiresHitl && result.ok) {
      return {
        ...result,
        data: {
          ...(typeof result.data === "object" && result.data !== null ? result.data : {}),
          hitlRequired: true,
          outputType: def.outputType,
        },
      };
    }
    return result;
  };

  const task: BackgroundTask = {
    id: def.id,
    name: def.name,
    run: wrappedRun,
    intervalMs: def.intervalMs,
    runOnce: def.runOnce,
  };

  registerTask(task);
  log.info(
    `registered background task: ${def.name} (output=${def.outputType}, hitl=${requiresHitl})`,
  );
}

/**
 * Check whether a given output type requires HITL approval.
 */
export function isHitlRequired(outputType: OutputType): boolean {
  return HITL_REQUIRED[outputType];
}
