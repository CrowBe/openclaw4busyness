import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { getHitlStore } from "../../hitl/store.js";
import type { ActionStatus, ActionType } from "../../hitl/types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function getHitlStorePath(): string {
  return path.join(resolveStateDir(process.env), "hitl.db");
}

function getStore() {
  return getHitlStore(getHitlStorePath());
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
    const { id, decided_by } = params;
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
    context.broadcast("hitl.action.resolved", { action, decision: "accepted" });
    respond(true, { action }, undefined);
  },

  "hitl.reject": ({ params, respond, context }) => {
    const { id, decided_by, reason } = params;
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
    // Notify connected operator clients (e.g. Discord HITL approval monitor)
    context.broadcast("hitl.action.submitted", { action });
    respond(true, { action }, undefined);
  },
};
