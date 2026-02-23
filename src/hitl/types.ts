export type ActionType = "financial" | "client_facing" | "system_modify";
export type ActionStatus = "pending" | "accepted" | "rejected" | "expired";

export type PendingAction = {
  id: string;
  skill_name: string;
  action_type: ActionType;
  proposed_data: string; // JSON blob
  requested_by: string; // Discord user ID
  requested_at: string; // ISO timestamp
  expires_at: string; // ISO timestamp
  status: ActionStatus;
  decided_by?: string | null; // Discord user ID of approver
  decided_at?: string | null; // ISO timestamp
  reject_reason?: string | null;
  session_key?: string | null;
  channel_id?: string | null;
};

export type CreatePendingActionParams = {
  skill_name: string;
  action_type: ActionType;
  proposed_data: unknown; // will be JSON.stringify'd
  requested_by: string;
  expires_in_ms?: number; // default 24 hours
  session_key?: string | null;
  channel_id?: string | null;
};

export type PendingActionQuery = {
  status?: ActionStatus;
  skill_name?: string;
  requested_by?: string;
  limit?: number;
};
