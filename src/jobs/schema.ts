import type { DatabaseSync } from "node:sqlite";

const CREATE_JOB_NOTES_TABLE = `
CREATE TABLE IF NOT EXISTS job_notes (
  id           TEXT PRIMARY KEY,
  job_id       TEXT,
  worker_name  TEXT,
  transcript   TEXT NOT NULL,
  scrubbed     INTEGER NOT NULL DEFAULT 0,
  pii_found    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
`;

const CREATE_JOB_NOTES_IDX = `
CREATE INDEX IF NOT EXISTS idx_job_notes_job_id ON job_notes (job_id);
`;

export function ensureJobSchema(db: DatabaseSync): void {
  db.exec(CREATE_JOB_NOTES_TABLE);
  db.exec(CREATE_JOB_NOTES_IDX);
}
