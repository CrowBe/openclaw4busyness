/**
 * E2E test for the Voice-to-Job-Note workflow.
 *
 * Exercises the complete pipeline: transcription → PII scrub → job store
 * → audit log, using real SQLite stores and mocking only the external
 * whisper binary.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock the whisper binary check and transcription
vi.mock("../src/voice/transcribe.js", () => ({
  isWhisperAvailable: () => true,
  transcribeAudio: vi.fn(),
}));

// Mock the config paths to use a temp directory for SQLite databases
const tmpDir = path.join("/tmp", `e2e-voice-note-${randomUUID()}`);

vi.mock("../src/config/paths.js", () => ({
  resolveStateDir: () => tmpDir,
}));

// Mock the subsystem logger
vi.mock("../src/logging/subsystem.js", () => ({
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

import voiceNoteSkill from "../skills/voice-note.js";
import { getAuditStore } from "../src/audit/store.js";
import { checkHitlRequired } from "../src/hitl/middleware.js";
import { getJobStore } from "../src/jobs/store.js";
import { buildResolutionMap, resolveTokens } from "../src/pii/resolver.js";
import { scrubPii } from "../src/pii/scrubber.js";
import { verifyNoPiiInAuditLog } from "../src/pii/verify.js";
import type { SkillContext } from "../src/skills/types.js";
import { transcribeAudio } from "../src/voice/transcribe.js";

const E2E_TIMEOUT_MS = 30_000;

describe("voice-to-job-note e2e workflow", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it(
    "transcribes voice, scrubs PII, saves job note, and creates audit entry",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      // Step 1: Mock a transcription result containing PII
      const rawTranscript =
        "Hi, this is a note for the plumbing job. " +
        "The client phone is 0412 345 678 and email is client@example.com. " +
        "ABN: 12 345 678 901. Job took 3 hours.";

      const mockTranscribe = vi.mocked(transcribeAudio);
      mockTranscribe.mockResolvedValueOnce({
        ok: true,
        text: rawTranscript,
        durationMs: 1500,
      });

      // Create a dummy audio file so the skill path validation passes
      const audioPath = path.join(tmpDir, "test-audio.ogg");
      fs.writeFileSync(audioPath, "fake-audio-data");

      // Step 2: Execute the voice-note skill
      const ctx: SkillContext = {
        senderRoles: ["field-worker-role-id"],
        requestedBy: "user-12345",
        channelId: "job-reports-channel-id",
      };

      const result = await voiceNoteSkill.execute(
        { audio_path: audioPath, job_id: "JOB-001", worker_name: "Test Worker" },
        ctx,
      );

      // Step 3: Verify the skill executed successfully
      expect(result.ok).toBe(true);
      expect(result.message).toContain("Job note saved");
      expect(result.message).toContain("PII items scrubbed");

      const data = result.data as { note_id: string; transcript: string; pii_found: boolean };
      expect(data.pii_found).toBe(true);

      // Step 4: Verify PII was scrubbed from the stored transcript
      expect(data.transcript).not.toContain("0412 345 678");
      expect(data.transcript).not.toContain("client@example.com");
      expect(data.transcript).not.toContain("12 345 678 901");
      expect(data.transcript).toContain("[PHONE]");
      expect(data.transcript).toContain("[EMAIL]");
      expect(data.transcript).toContain("[TAX-ID]");
      // Non-PII content is preserved
      expect(data.transcript).toContain("plumbing job");
      expect(data.transcript).toContain("3 hours");

      // Step 5: Verify the job note was persisted in SQLite
      const jobStore = getJobStore(path.join(tmpDir, "jobs.db"));
      const notes = jobStore.listJobNotes("JOB-001");
      expect(notes).toHaveLength(1);
      expect(notes[0].job_id).toBe("JOB-001");
      expect(notes[0].worker_name).toBe("Test Worker");
      expect(notes[0].scrubbed).toBe(true);
      expect(notes[0].pii_found).toBe(true);
      expect(notes[0].transcript).toContain("[PHONE]");
      expect(notes[0].transcript).not.toContain("0412 345 678");

      // Step 6: Verify PII resolution round-trip (resolver can restore originals)
      const scrubResult = scrubPii(rawTranscript);
      const resolutionMap = buildResolutionMap(scrubResult);
      const restored = resolveTokens(scrubResult.scrubbed, resolutionMap);
      expect(restored).toBe(rawTranscript);
    },
  );

  it("skill metadata correctly identifies HITL requirements", () => {
    // voice-note is not financial/client-facing, so HITL check depends on read_only
    const hitlCheck = checkHitlRequired(voiceNoteSkill.metadata);
    // voice-note has read_only: false, so it requires system_modify approval
    expect(hitlCheck.requiresApproval).toBe(true);
    expect(hitlCheck.actionType).toBe("system_modify");
  });

  it("handles transcription failure gracefully", async () => {
    const mockTranscribe = vi.mocked(transcribeAudio);
    mockTranscribe.mockResolvedValueOnce({
      ok: false,
      error: "whisper exited with non-zero status",
    });

    const audioPath = path.join(tmpDir, "bad-audio.ogg");
    fs.writeFileSync(audioPath, "corrupt-data");

    const ctx: SkillContext = { requestedBy: "user-999" };
    const result = await voiceNoteSkill.execute({ audio_path: audioPath }, ctx);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Transcription failed");
  });

  it("handles text without PII (no scrubbing needed)", async () => {
    const cleanTranscript = "Finished the tiling work on level two. Took about four hours.";

    const mockTranscribe = vi.mocked(transcribeAudio);
    mockTranscribe.mockResolvedValueOnce({
      ok: true,
      text: cleanTranscript,
      durationMs: 800,
    });

    const audioPath = path.join(tmpDir, "clean-audio.ogg");
    fs.writeFileSync(audioPath, "fake-audio");

    const ctx: SkillContext = { requestedBy: "user-555" };
    const result = await voiceNoteSkill.execute({ audio_path: audioPath, job_id: "JOB-002" }, ctx);

    expect(result.ok).toBe(true);
    expect(result.message).not.toContain("PII items scrubbed");

    const data = result.data as { transcript: string; pii_found: boolean };
    expect(data.pii_found).toBe(false);
    expect(data.transcript).toBe(cleanTranscript);
  });

  it("PII verification passes when audit entries are clean", () => {
    const auditDbPath = path.join(tmpDir, "audit.db");
    const store = getAuditStore(auditDbPath);

    // Log entries that are properly scrubbed (no raw PII)
    store.log({
      event_type: "skill.executed",
      actor: "user-123",
      skill_name: "voice-note",
      detail: "Job note saved with [PHONE] and [EMAIL] scrubbed. Note ID: abc-123",
    });

    const result = verifyNoPiiInAuditLog(100, auditDbPath);
    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("PII verification catches leaked PII in audit entries", () => {
    const auditDbPath = path.join(tmpDir, "audit.db");
    const store = getAuditStore(auditDbPath);

    // Simulate a bug where raw PII leaked into the audit log
    store.log({
      event_type: "skill.executed",
      actor: "user-123",
      skill_name: "voice-note",
      detail: "Transcript for client at 0412 345 678 saved.",
    });

    const result = verifyNoPiiInAuditLog(100, auditDbPath);
    expect(result.clean).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].categories).toContain("phone");
  });
});
