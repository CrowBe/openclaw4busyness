import { describe, it, expect } from "vitest";
// Note: The store is in-memory with module-level state.

describe("job notes store", () => {
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
});
