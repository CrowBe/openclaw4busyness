// skills/audit-log.ts
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
    // In the MVP, return a placeholder message.
    // Full implementation hooks into AuditStore after it's wired up.
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
    const eventType = typeof args.event_type === "string" ? args.event_type : undefined;

    return {
      ok: true,
      message:
        `[audit-log] Query: event_type=${eventType ?? "all"}, limit=${limit}. ` +
        "Connect AuditStore to return real results. Audit logging is active.",
      data: { queried: true, limit, event_type: eventType },
    };
  },
};

export default auditLogSkill;
