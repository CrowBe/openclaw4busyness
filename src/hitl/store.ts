import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { ensureHitlSchema } from "./schema.js";
import type {
  ActionStatus,
  CreatePendingActionParams,
  PendingAction,
  PendingActionQuery,
} from "./types.js";

const DEFAULT_EXPIRES_IN_MS = 24 * 60 * 60 * 1000; // 24 hours

type PendingActionRow = {
  id: string;
  skill_name: string;
  action_type: string;
  proposed_data: string;
  requested_by: string;
  requested_at: string;
  expires_at: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  session_key: string | null;
  channel_id: string | null;
};

function rowToAction(row: PendingActionRow): PendingAction {
  return {
    id: row.id,
    skill_name: row.skill_name,
    action_type: row.action_type as PendingAction["action_type"],
    proposed_data: row.proposed_data,
    requested_by: row.requested_by,
    requested_at: row.requested_at,
    expires_at: row.expires_at,
    status: row.status as ActionStatus,
    decided_by: row.decided_by,
    decided_at: row.decided_at,
    reject_reason: row.reject_reason,
    session_key: row.session_key,
    channel_id: row.channel_id,
  };
}

export class HitlStore {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private getDb(): DatabaseSync {
    if (!this.db) {
      const { DatabaseSync } = requireNodeSqlite();
      this.db = new DatabaseSync(this.dbPath);
      ensureHitlSchema(this.db);
    }
    return this.db;
  }

  createPendingAction(params: CreatePendingActionParams): PendingAction {
    const db = this.getDb();
    const id = randomUUID();
    const now = new Date();
    const requestedAt = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + (params.expires_in_ms ?? DEFAULT_EXPIRES_IN_MS),
    ).toISOString();
    const proposedData = JSON.stringify(params.proposed_data);

    db.prepare(`
      INSERT INTO pending_actions (
        id, skill_name, action_type, proposed_data, requested_by,
        requested_at, expires_at, status, session_key, channel_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      params.skill_name,
      params.action_type,
      proposedData,
      params.requested_by,
      requestedAt,
      expiresAt,
      params.session_key ?? null,
      params.channel_id ?? null,
    );

    const row = db
      .prepare("SELECT * FROM pending_actions WHERE id = ?")
      .get(id) as PendingActionRow;
    return rowToAction(row);
  }

  getPendingAction(id: string): PendingAction | null {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM pending_actions WHERE id = ?").get(id) as
      | PendingActionRow
      | undefined;
    if (!row) {
      return null;
    }
    return rowToAction(row);
  }

  listPendingActions(query?: PendingActionQuery): PendingAction[] {
    const db = this.getDb();

    // Auto-expire pending actions before querying
    this.expireActions();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query?.status !== undefined) {
      conditions.push("status = ?");
      params.push(query.status);
    }
    if (query?.skill_name !== undefined) {
      conditions.push("skill_name = ?");
      params.push(query.skill_name);
    }
    if (query?.requested_by !== undefined) {
      conditions.push("requested_by = ?");
      params.push(query.requested_by);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = query?.limit !== undefined ? `LIMIT ${query.limit}` : "";

    const sql =
      `SELECT * FROM pending_actions ${whereClause} ORDER BY requested_at DESC ${limitClause}`.trim();
    const rows = db.prepare(sql).all(...params) as PendingActionRow[];
    return rows.map(rowToAction);
  }

  acceptAction(id: string, decidedBy: string): PendingAction | null {
    const db = this.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE pending_actions
      SET status = 'accepted', decided_by = ?, decided_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(decidedBy, now, id);

    const row = db.prepare("SELECT * FROM pending_actions WHERE id = ?").get(id) as
      | PendingActionRow
      | undefined;
    if (!row) {
      return null;
    }
    return rowToAction(row);
  }

  rejectAction(id: string, decidedBy: string, reason?: string): PendingAction | null {
    const db = this.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE pending_actions
      SET status = 'rejected', decided_by = ?, decided_at = ?, reject_reason = ?
      WHERE id = ? AND status = 'pending'
    `).run(decidedBy, now, reason ?? null, id);

    const row = db.prepare("SELECT * FROM pending_actions WHERE id = ?").get(id) as
      | PendingActionRow
      | undefined;
    if (!row) {
      return null;
    }
    return rowToAction(row);
  }

  expireActions(): number {
    const db = this.getDb();
    const now = new Date().toISOString();

    const result = db
      .prepare(`
      UPDATE pending_actions
      SET status = 'expired'
      WHERE status = 'pending' AND expires_at <= ?
    `)
      .run(now);

    return Number(result.changes);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

let defaultStore: HitlStore | null = null;

export function getHitlStore(dbPath: string): HitlStore {
  if (!defaultStore) {
    defaultStore = new HitlStore(dbPath);
  }
  return defaultStore;
}

export function createPendingAction(
  params: CreatePendingActionParams,
  store: HitlStore,
): PendingAction {
  return store.createPendingAction(params);
}

export function getPendingAction(id: string, store: HitlStore): PendingAction | null {
  return store.getPendingAction(id);
}

export function listPendingActions(
  query: PendingActionQuery | undefined,
  store: HitlStore,
): PendingAction[] {
  return store.listPendingActions(query);
}

export function acceptAction(
  id: string,
  decidedBy: string,
  store: HitlStore,
): PendingAction | null {
  return store.acceptAction(id, decidedBy);
}

export function rejectAction(
  id: string,
  decidedBy: string,
  store: HitlStore,
  reason?: string,
): PendingAction | null {
  return store.rejectAction(id, decidedBy, reason);
}

export function expireActions(store: HitlStore): number {
  return store.expireActions();
}
