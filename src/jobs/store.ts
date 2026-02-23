import { randomUUID } from "node:crypto";
import type { JobNote } from "./types.js";

const notes: JobNote[] = [];

export function createJobNote(params: {
  job_id?: string | null;
  worker_name?: string | null;
  transcript: string;
  scrubbed: boolean;
  pii_found: boolean;
}): JobNote {
  const note: JobNote = {
    id: randomUUID(),
    job_id: params.job_id ?? null,
    worker_name: params.worker_name ?? null,
    transcript: params.transcript,
    scrubbed: params.scrubbed,
    pii_found: params.pii_found,
    created_at: new Date().toISOString(),
  };
  notes.push(note);
  return note;
}

export function listJobNotes(job_id?: string): JobNote[] {
  if (job_id) {
    return notes.filter((n) => n.job_id === job_id);
  }
  return [...notes];
}
