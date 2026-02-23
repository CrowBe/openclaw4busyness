import type { DatabaseSync } from "node:sqlite";

const CREATE_PENDING_ACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS pending_actions (
  id            TEXT PRIMARY KEY,
  skill_name    TEXT NOT NULL,
  action_type   TEXT NOT NULL,
  proposed_data TEXT NOT NULL,
  requested_by  TEXT NOT NULL,
  requested_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  decided_by    TEXT,
  decided_at    TEXT,
  reject_reason TEXT,
  session_key   TEXT,
  channel_id    TEXT
);
`;

export function ensureHitlSchema(db: DatabaseSync): void {
  db.exec(CREATE_PENDING_ACTIONS_TABLE);
}
