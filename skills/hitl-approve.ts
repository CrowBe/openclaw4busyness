import path from "node:path";
import { resolveStateDir } from "../src/config/paths.js";
import { getHitlStore } from "../src/hitl/store.js";
import type { Skill } from "../src/skills/types.js";

function getStore() {
  const dbPath = path.join(resolveStateDir(process.env), "hitl.db");
  return getHitlStore(dbPath);
}

const hitlApproveSkill: Skill = {
  metadata: {
    name: "hitl-approve",
    description: "Approve or reject a pending HITL action. Admin/operator use only.",
    financial: false,
    client_facing: false,
    read_only: false,
  },
  async execute(args, ctx) {
    const action_id = typeof args.action_id === "string" ? args.action_id.trim() : "";
    if (!action_id) {
      return { ok: false, message: "action_id is required" };
    }

    const decision = typeof args.decision === "string" ? args.decision.trim().toLowerCase() : "";
    if (decision !== "accept" && decision !== "reject") {
      return { ok: false, message: 'decision must be "accept" or "reject"' };
    }

    const decided_by = ctx.requestedBy ?? "unknown";
    const reason = typeof args.reason === "string" ? args.reason.trim() : undefined;

    const store = getStore();

    if (decision === "accept") {
      const action = store.acceptAction(action_id, decided_by);
      if (!action) {
        return { ok: false, message: `Action ${action_id} not found or already resolved` };
      }
      return {
        ok: true,
        message: `Action ${action_id} accepted by <@${decided_by}>`,
        data: { action },
      };
    } else {
      const action = store.rejectAction(action_id, decided_by, reason);
      if (!action) {
        return { ok: false, message: `Action ${action_id} not found or already resolved` };
      }
      return {
        ok: true,
        message: `Action ${action_id} rejected by <@${decided_by}>. Reason: ${reason ?? "none"}`,
        data: { action },
      };
    }
  },
};

export default hitlApproveSkill;
