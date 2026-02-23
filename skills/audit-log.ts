// skills/audit-log.ts
import { getAuditStore } from "../src/audit/store.js";
import type { AuditEvent } from "../src/audit/types.js";
import type { Skill } from "../src/skills/types.js";

const auditLogSkill: Skill = {
  metadata: {
    name: "audit-log",
    description: "Query the audit log. Admin only. Lists recent events with optional filters.",
    financial: false,
    client_facing: false,
    read_only: true,
  },
  async execute(args, _ctx) {
    const limit = typeof args.limit === "number" ? Math.min(Math.max(args.limit, 1), 50) : 20;
    const event_type =
      typeof args.event_type === "string"
        ? (args.event_type as AuditEvent["event_type"])
        : undefined;
    const actor = typeof args.actor === "string" ? args.actor : undefined;
    const skill_name = typeof args.skill_name === "string" ? args.skill_name : undefined;

    const store = getAuditStore();
    const events = store.query({ event_type, actor, skill_name, limit });

    if (events.length === 0) {
      return {
        ok: true,
        message: "No audit events found matching your query.",
        data: { events: [], limit, event_type, actor, skill_name },
      };
    }

    const lines = events.map(
      (e) =>
        `[${e.timestamp}] ${e.event_type} | actor=${e.actor}` +
        (e.skill_name ? ` | skill=${e.skill_name}` : "") +
        (e.action_id ? ` | action=${e.action_id}` : "") +
        ` | ${e.detail}`,
    );

    return {
      ok: true,
      message: lines.join("\n"),
      data: { events, limit, event_type, actor, skill_name },
    };
  },
};

export default auditLogSkill;
