// skills/audit-log.ts
import { getAuditStore } from "../src/audit/store.js";
import type { AuditEvent } from "../src/audit/types.js";
import { verifyNoPiiInAuditLog } from "../src/pii/verify.js";
import type { Skill } from "../src/skills/types.js";

const auditLogSkill: Skill = {
  metadata: {
    name: "audit-log",
    description:
      "Query the audit log or verify PII scrubbing. Admin only. " +
      'Use subcommand "verify-pii" to scan recent audit entries for unredacted PII.',
    financial: false,
    client_facing: false,
    read_only: true,
  },
  async execute(args, _ctx) {
    // Route to verify-pii subcommand when requested
    const subcommand = typeof args.subcommand === "string" ? args.subcommand.trim() : "";
    if (subcommand === "verify-pii") {
      return executeVerifyPii(args);
    }

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

function executeVerifyPii(args: Record<string, unknown>) {
  const limit = typeof args.limit === "number" ? Math.min(Math.max(args.limit, 1), 500) : 100;
  const result = verifyNoPiiInAuditLog(limit);

  if (result.clean) {
    return {
      ok: true,
      message: `PII verification passed. Scanned ${result.scanned} audit entries — no unredacted PII found.`,
      data: result,
    };
  }

  const violationLines = result.violations.map(
    (v) => `  - Event ${v.auditEventId}: ${v.categories.join(", ")} detected in ${v.field}`,
  );

  return {
    ok: false,
    message:
      `PII verification FAILED. Scanned ${result.scanned} entries, found ${result.violations.length} violation(s):\n` +
      violationLines.join("\n"),
    data: result,
  };
}

export default auditLogSkill;
