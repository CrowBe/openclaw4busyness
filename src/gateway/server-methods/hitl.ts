import path from "node:path";
import { getAuditStore } from "../../audit/store.js";
import { resolveStateDir } from "../../config/paths.js";
import { buildHitlApprovalMessage, sendHitlApprovalMessage } from "../../hitl/discord-approval.js";
import { getHitlStore } from "../../hitl/store.js";
import type { ActionStatus, ActionType } from "../../hitl/types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const log = createSubsystemLogger("hitl");

function getHitlStorePath(): string {
  return path.join(resolveStateDir(process.env), "hitl.db");
}

function getStore() {
  return getHitlStore(getHitlStorePath());
}

/**
 * Return the list of Discord role IDs authorised to accept/reject HITL actions.
 * Reads `HITL_OPERATOR_ROLE_IDS` (comma-separated) from the environment.
 * Returns an empty array when the variable is not set (no restriction applied).
 */
function resolveOperatorRoleIds(): string[] {
  const raw = process.env.HITL_OPERATOR_ROLE_IDS;
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}

/**
 * Fire a Discord approval notification for a newly-submitted HITL action.
 * Reads `HITL_APPROVAL_CHANNEL_ID` and `DISCORD_BOT_TOKEN` from the environment.
 * Errors are logged but never propagate — the submit must succeed even when
 * Discord is unavailable.
 */
function fireHitlDiscordNotification(action: {
  id: string;
  skill_name: string;
  action_type: string;
  proposed_data: string;
  requested_by: string;
  expires_at: string;
}): void {
  const approvalChannelId = process.env.HITL_APPROVAL_CHANNEL_ID;
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (!approvalChannelId || !discordToken) {
    return;
  }
  const message = buildHitlApprovalMessage({
    actionId: action.id,
    skillName: action.skill_name,
    actionType: action.action_type,
    proposedData: JSON.parse(action.proposed_data),
    requestedBy: action.requested_by,
    expiresAt: action.expires_at,
    approvalChannelId,
  });
  sendHitlApprovalMessage({ message, token: discordToken }).catch((err: unknown) => {
    log.warn(`Discord approval notification failed for action ${action.id}: ${String(err)}`);
  });
}

const VALID_STATUSES = new Set<string>(["pending", "accepted", "rejected", "expired"]);
const VALID_ACTION_TYPES = new Set<string>(["financial", "client_facing", "system_modify"]);

export const hitlHandlers: GatewayRequestHandlers = {
  "hitl.list": ({ params, respond }) => {
    const status = params.status;
    if (status !== undefined) {
      if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `status must be one of: pending, accepted, rejected, expired`,
          ),
        );
        return;
      }
    }

    const skill_name = params.skill_name;
    if (skill_name !== undefined && typeof skill_name !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skill_name must be a string"),
      );
      return;
    }

    const requested_by = params.requested_by;
    if (requested_by !== undefined && typeof requested_by !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "requested_by must be a string"),
      );
      return;
    }

    const limit = params.limit;
    if (limit !== undefined && typeof limit !== "number") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "limit must be a number"));
      return;
    }

    const store = getStore();
    const actions = store.listPendingActions({
      status: status as ActionStatus | undefined,
      skill_name,
      requested_by,
      limit,
    });
    respond(true, { actions }, undefined);
  },

  "hitl.get": ({ params, respond }) => {
    const { id } = params;
    if (!id || typeof id !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id is required and must be a string"),
      );
      return;
    }

    const store = getStore();
    const action = store.getPendingAction(id);
    if (!action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `pending action not found: ${id}`),
      );
      return;
    }
    respond(true, { action }, undefined);
  },

  "hitl.accept": ({ params, respond, context }) => {
    const { id, decided_by, sender_roles } = params;
    if (!id || typeof id !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id is required and must be a string"),
      );
      return;
    }
    if (!decided_by || typeof decided_by !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "decided_by is required and must be a string"),
      );
      return;
    }

    // Gate accept/reject to operator and admin roles when configured.
    const operatorRoleIds = resolveOperatorRoleIds();
    if (operatorRoleIds.length > 0) {
      const memberRoles = Array.isArray(sender_roles)
        ? (sender_roles as unknown[]).filter((r): r is string => typeof r === "string")
        : [];
      const allowed = memberRoles.some((r) => operatorRoleIds.includes(r));
      if (!allowed) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Only Office Operator or Admin roles may accept HITL actions",
          ),
        );
        return;
      }
    }

    const store = getStore();
    const action = store.acceptAction(id, decided_by);
    if (!action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `pending action not found: ${id}`),
      );
      return;
    }
    getAuditStore().log({
      event_type: "hitl.accepted",
      actor: decided_by,
      skill_name: action.skill_name,
      action_id: action.id,
      detail: `HITL action ${action.id} accepted by ${decided_by}`,
    });
    context.broadcast("hitl.action.resolved", { action, decision: "accepted" });
    respond(true, { action }, undefined);
  },

  "hitl.reject": ({ params, respond, context }) => {
    const { id, decided_by, reason, sender_roles } = params;
    if (!id || typeof id !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id is required and must be a string"),
      );
      return;
    }
    if (!decided_by || typeof decided_by !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "decided_by is required and must be a string"),
      );
      return;
    }
    if (reason !== undefined && typeof reason !== "string") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "reason must be a string"));
      return;
    }

    // Gate accept/reject to operator and admin roles when configured.
    const operatorRoleIds = resolveOperatorRoleIds();
    if (operatorRoleIds.length > 0) {
      const memberRoles = Array.isArray(sender_roles)
        ? (sender_roles as unknown[]).filter((r): r is string => typeof r === "string")
        : [];
      const allowed = memberRoles.some((r) => operatorRoleIds.includes(r));
      if (!allowed) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Only Office Operator or Admin roles may reject HITL actions",
          ),
        );
        return;
      }
    }

    const store = getStore();
    const action = store.rejectAction(id, decided_by, reason);
    if (!action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `pending action not found: ${id}`),
      );
      return;
    }
    getAuditStore().log({
      event_type: "hitl.rejected",
      actor: decided_by,
      skill_name: action.skill_name,
      action_id: action.id,
      detail: `HITL action ${action.id} rejected by ${decided_by}` + (reason ? `: ${reason}` : ""),
    });
    context.broadcast("hitl.action.resolved", { action, decision: "rejected" });
    respond(true, { action }, undefined);
  },

  "hitl.submit": ({ params, respond, context }) => {
    const {
      skill_name,
      action_type,
      proposed_data,
      requested_by,
      expires_in_ms,
      session_key,
      channel_id,
    } = params;

    if (!skill_name || typeof skill_name !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skill_name is required and must be a string"),
      );
      return;
    }
    if (!action_type || typeof action_type !== "string" || !VALID_ACTION_TYPES.has(action_type)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "action_type is required and must be one of: financial, client_facing, system_modify",
        ),
      );
      return;
    }
    if (proposed_data === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "proposed_data is required"),
      );
      return;
    }
    if (!requested_by || typeof requested_by !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "requested_by is required and must be a string"),
      );
      return;
    }
    if (expires_in_ms !== undefined && typeof expires_in_ms !== "number") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "expires_in_ms must be a number"),
      );
      return;
    }
    if (session_key !== undefined && session_key !== null && typeof session_key !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "session_key must be a string"),
      );
      return;
    }
    if (channel_id !== undefined && channel_id !== null && typeof channel_id !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channel_id must be a string"),
      );
      return;
    }

    const store = getStore();
    const action = store.createPendingAction({
      skill_name,
      action_type: action_type as ActionType,
      proposed_data,
      requested_by,
      expires_in_ms,
      session_key,
      channel_id,
    });
    getAuditStore().log({
      event_type: "hitl.submitted",
      actor: requested_by,
      skill_name,
      action_id: action.id,
      detail: `HITL action ${action.id} submitted for ${action.action_type} approval`,
      session_key: typeof session_key === "string" ? session_key : undefined,
      channel_id: typeof channel_id === "string" ? channel_id : undefined,
    });
    // Notify connected operator clients (e.g. Discord HITL approval monitor)
    context.broadcast("hitl.action.submitted", { action });
    // Send approval message to the configured Discord #approvals channel.
    fireHitlDiscordNotification(action);
    respond(true, { action }, undefined);
  },
};
