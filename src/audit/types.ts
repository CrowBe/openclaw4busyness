export type AuditEventType =
  | "skill.executed"
  | "skill.rejected"
  | "hitl.submitted"
  | "hitl.accepted"
  | "hitl.rejected"
  | "hitl.expired"
  | "access.denied"
  | "pii.scrubbed";

export type AuditEvent = {
  id: string;
  event_type: AuditEventType;
  actor: string; // Discord user ID or system
  skill_name?: string | null;
  action_id?: string | null; // HITL action ID
  detail: string; // Human-readable description
  timestamp: string; // ISO timestamp
  session_key?: string | null;
  channel_id?: string | null;
};

export type CreateAuditEventParams = Omit<AuditEvent, "id" | "timestamp">;

export type AuditQuery = {
  event_type?: AuditEventType;
  actor?: string;
  skill_name?: string;
  since?: string; // ISO timestamp
  limit?: number;
};
