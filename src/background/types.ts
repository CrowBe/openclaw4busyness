export type BackgroundTaskStatus = "idle" | "running" | "done" | "failed";

export type BackgroundTaskResult = {
  ok: boolean;
  message?: string;
  data?: unknown;
};

export type BackgroundTaskFn = () => Promise<BackgroundTaskResult>;

export type BackgroundTask = {
  id: string;
  name: string;
  run: BackgroundTaskFn;
  intervalMs?: number; // If set, task runs on an interval
  runOnce?: boolean; // If true, only runs once at startup
};

export type BackgroundTaskState = {
  task: BackgroundTask;
  status: BackgroundTaskStatus;
  lastRunAt?: number;
  lastResult?: BackgroundTaskResult;
  timer?: ReturnType<typeof setInterval>;
};
