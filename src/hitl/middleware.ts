import type { SkillMetadata } from "../skills/types.js";
import type { ActionType } from "./types.js";

export type HitlCheckResult =
  | { requiresApproval: false }
  | { requiresApproval: true; actionType: ActionType; reason: string };

/**
 * Check if a skill action requires human approval.
 * Financial and client-facing actions always require approval.
 * System modifications require approval unless explicitly marked read-only.
 */
export function checkHitlRequired(metadata: SkillMetadata): HitlCheckResult {
  if (metadata.financial) {
    return {
      requiresApproval: true,
      actionType: "financial",
      reason: `Skill "${metadata.name}" involves financial data and requires approval`,
    };
  }
  if (metadata.client_facing) {
    return {
      requiresApproval: true,
      actionType: "client_facing",
      reason: `Skill "${metadata.name}" sends client-facing communications and requires approval`,
    };
  }
  if (!metadata.read_only) {
    return {
      requiresApproval: true,
      actionType: "system_modify",
      reason: `Skill "${metadata.name}" modifies system state and requires approval`,
    };
  }
  return { requiresApproval: false };
}
