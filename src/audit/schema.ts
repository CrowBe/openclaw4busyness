import type { DatabaseSync } from "node:sqlite";

export function ensureAuditSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY,
      event_type  TEXT NOT NULL,
      actor       TEXT NOT NULL,
      skill_name  TEXT,
      action_id   TEXT,
      detail      TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      session_key TEXT,
      channel_id  TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);`);
}
