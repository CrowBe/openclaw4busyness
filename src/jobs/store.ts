import { randomUUID } from "node:crypto";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { resolveStateDir } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { ensureJobSchema } from "./schema.js";
import type { JobNote } from "./types.js";

type JobNoteRow = {
  id: string;
  job_id: string | null;
  worker_name: string | null;
  transcript: string;
  scrubbed: number;
  pii_found: number;
  created_at: string;
};

function rowToNote(row: JobNoteRow): JobNote {
  return {
    id: row.id,
    job_id: row.job_id,
    worker_name: row.worker_name,
    transcript: row.transcript,
    scrubbed: row.scrubbed === 1,
    pii_found: row.pii_found === 1,
    created_at: row.created_at,
  };
}

export class JobStore {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private getDb(): DatabaseSync {
    if (!this.db) {
      const { DatabaseSync } = requireNodeSqlite();
      this.db = new DatabaseSync(this.dbPath);
      ensureJobSchema(this.db);
    }
    return this.db;
  }

  createJobNote(params: {
    job_id?: string | null;
    worker_name?: string | null;
    transcript: string;
    scrubbed: boolean;
    pii_found: boolean;
  }): JobNote {
    const db = this.getDb();
    const id = randomUUID();
    const created_at = new Date().toISOString();

    db.prepare(`
      INSERT INTO job_notes (id, job_id, worker_name, transcript, scrubbed, pii_found, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.job_id ?? null,
      params.worker_name ?? null,
      params.transcript,
      params.scrubbed ? 1 : 0,
      params.pii_found ? 1 : 0,
      created_at,
    );

    const row = db.prepare("SELECT * FROM job_notes WHERE id = ?").get(id) as JobNoteRow;
    return rowToNote(row);
  }

  listJobNotes(job_id?: string): JobNote[] {
    const db = this.getDb();
    if (job_id) {
      const rows = db
        .prepare("SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC")
        .all(job_id) as JobNoteRow[];
      return rows.map(rowToNote);
    }
    const rows = db
      .prepare("SELECT * FROM job_notes ORDER BY created_at DESC")
      .all() as JobNoteRow[];
    return rows.map(rowToNote);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton per dbPath.
const jobStoreCache = new Map<string, JobStore>();

export function getJobStore(dbPath?: string): JobStore {
  const resolved = dbPath ?? path.join(resolveStateDir(process.env), "jobs.db");
  let store = jobStoreCache.get(resolved);
  if (!store) {
    store = new JobStore(resolved);
    jobStoreCache.set(resolved, store);
  }
  return store;
}

// Module-level convenience functions to preserve the existing public API.

export function createJobNote(params: {
  job_id?: string | null;
  worker_name?: string | null;
  transcript: string;
  scrubbed: boolean;
  pii_found: boolean;
}): JobNote {
  return getJobStore().createJobNote(params);
}

export function listJobNotes(job_id?: string): JobNote[] {
  return getJobStore().listJobNotes(job_id);
}
