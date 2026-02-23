import { createJobNote } from "../src/jobs/store.js";
import { scrubPii } from "../src/pii/scrubber.js";
import type { Skill } from "../src/skills/types.js";
import { transcribeAudio } from "../src/voice/transcribe.js";

const voiceNoteSkill: Skill = {
  metadata: {
    name: "voice-note",
    description:
      "Transcribe a voice recording and save as a job note. Scrubs PII automatically. Requires HITL approval before saving.",
    financial: false,
    client_facing: false,
    read_only: false, // modifies job notes store
  },
  async execute(args, ctx) {
    const audioPath = typeof args.audio_path === "string" ? args.audio_path.trim() : "";
    if (!audioPath) {
      return { ok: false, message: "audio_path is required" };
    }

    const jobId = typeof args.job_id === "string" ? args.job_id.trim() : undefined;
    const workerName = typeof args.worker_name === "string" ? args.worker_name.trim() : undefined;

    // Transcribe audio
    const transcription = await transcribeAudio({ audioPath });
    if (!transcription.ok || !transcription.text) {
      return {
        ok: false,
        message: `Transcription failed: ${transcription.error ?? "unknown error"}`,
      };
    }

    // Scrub PII from transcript
    const scrubResult = scrubPii(transcription.text);
    const finalText = scrubResult.scrubbed;

    // Save job note
    const note = createJobNote({
      job_id: jobId ?? null,
      worker_name: workerName ?? null,
      transcript: finalText,
      scrubbed: scrubResult.hasPii,
      pii_found: scrubResult.hasPii,
    });

    const piiMsg = scrubResult.hasPii ? ` (${scrubResult.matches.length} PII items scrubbed)` : "";

    return {
      ok: true,
      message: `Job note saved${piiMsg}. Note ID: ${note.id}`,
      data: { note_id: note.id, transcript: finalText, pii_found: scrubResult.hasPii },
    };
  },
};

export default voiceNoteSkill;
