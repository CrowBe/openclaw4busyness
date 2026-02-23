import { randomUUID } from "node:crypto";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { ensureAuditSchema } from "./schema.js";
import type { AuditEvent, AuditQuery, CreateAuditEventParams } from "./types.js";

type DatabaseSync = import("node:sqlite").DatabaseSync;
// SQLInputValue matches the node:sqlite accepted binding value types
type SQLInputValue = null | number | bigint | string | NodeJS.ArrayBufferView;
type SQLBindings = Record<string, SQLInputValue>;

const DEFAULT_QUERY_LIMIT = 100;

export class AuditStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    const { DatabaseSync } = requireNodeSqlite();
    this.db = new DatabaseSync(dbPath);
    ensureAuditSchema(this.db);
  }

  log(params: CreateAuditEventParams): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      event_type: params.event_type,
      actor: params.actor,
      skill_name: params.skill_name ?? null,
      action_id: params.action_id ?? null,
      detail: params.detail,
      session_key: params.session_key ?? null,
      channel_id: params.channel_id ?? null,
    };

    const stmt = this.db.prepare(`
      INSERT INTO audit_log
        (id, event_type, actor, skill_name, action_id, detail, timestamp, session_key, channel_id)
      VALUES
        (:id, :event_type, :actor, :skill_name, :action_id, :detail, :timestamp, :session_key, :channel_id)
    `);

    const runBindings: SQLBindings = {
      id: event.id,
      event_type: event.event_type,
      actor: event.actor,
      skill_name: event.skill_name ?? null,
      action_id: event.action_id ?? null,
      detail: event.detail,
      timestamp: event.timestamp,
      session_key: event.session_key ?? null,
      channel_id: event.channel_id ?? null,
    };
    stmt.run(runBindings);

    return event;
  }

  query(params?: AuditQuery): AuditEvent[] {
    const conditions: string[] = [];
    const bindings: SQLBindings = {};

    if (params?.event_type) {
      conditions.push("event_type = :event_type");
      bindings.event_type = params.event_type;
    }

    if (params?.actor) {
      conditions.push("actor = :actor");
      bindings.actor = params.actor;
    }

    if (params?.skill_name) {
      conditions.push("skill_name = :skill_name");
      bindings.skill_name = params.skill_name;
    }

    if (params?.since) {
      conditions.push("timestamp > :since");
      bindings.since = params.since;
    }

    const limit = params?.limit ?? DEFAULT_QUERY_LIMIT;
    bindings.limit = limit;

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT id, event_type, actor, skill_name, action_id, detail, timestamp, session_key, channel_id
      FROM audit_log
      ${where}
      ORDER BY timestamp DESC
      LIMIT :limit
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(bindings);

    return rows.map((row) => ({
      id: row.id as string,
      event_type: row.event_type as AuditEvent["event_type"],
      actor: row.actor as string,
      skill_name: (row.skill_name as string | null) ?? null,
      action_id: (row.action_id as string | null) ?? null,
      detail: row.detail as string,
      timestamp: row.timestamp as string,
      session_key: (row.session_key as string | null) ?? null,
      channel_id: (row.channel_id as string | null) ?? null,
    }));
  }
}
