import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";

const tmpDir = path.join("/tmp", `jobs-store-test-${randomUUID()}`);

vi.mock("../config/paths.js", () => ({
  resolveStateDir: () => tmpDir,
}));

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
    subsystem: "test",
  }),
}));

describe("job notes store", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("creates a job note with correct fields", async () => {
    const { createJobNote } = await import("./store.js");
    const note = createJobNote({
      job_id: "JOB-001",
      worker_name: "Bob Smith",
      transcript: "Replaced tap washer.",
      scrubbed: false,
      pii_found: false,
    });
    expect(note.id).toBeTruthy();
    expect(note.job_id).toBe("JOB-001");
    expect(note.transcript).toBe("Replaced tap washer.");
    expect(note.created_at).toBeTruthy();
  });

  it("lists job notes filtered by job_id", async () => {
    const { createJobNote, listJobNotes } = await import("./store.js");
    createJobNote({
      job_id: "JOB-LIST-A",
      transcript: "Note for A.",
      scrubbed: false,
      pii_found: false,
    });
    createJobNote({
      job_id: "JOB-LIST-B",
      transcript: "Note for B.",
      scrubbed: false,
      pii_found: false,
    });
    const notesA = listJobNotes("JOB-LIST-A");
    expect(notesA).toHaveLength(1);
    expect(notesA[0].job_id).toBe("JOB-LIST-A");
  });

  it("records PII scrubbing state", async () => {
    const { createJobNote } = await import("./store.js");
    const note = createJobNote({
      job_id: "JOB-PII",
      transcript: "Called [PHONE] about the job.",
      scrubbed: true,
      pii_found: true,
    });
    expect(note.scrubbed).toBe(true);
    expect(note.pii_found).toBe(true);
  });
});
