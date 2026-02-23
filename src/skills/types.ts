export type ActionType = "financial" | "client_facing" | "system_modify";

export type SkillMetadata = {
  name: string;
  description: string;
  financial: boolean;
  client_facing: boolean;
  read_only: boolean;
};

export type SkillContext = {
  senderRoles?: string[];
  sessionKey?: string;
  channelId?: string;
  requestedBy?: string;
};

export type SkillResult = {
  ok: boolean;
  message: string;
  data?: unknown;
  hitl_action_id?: string; // Set when action requires HITL approval
};

export type SkillFn = (args: Record<string, unknown>, ctx: SkillContext) => Promise<SkillResult>;

export type Skill = {
  metadata: SkillMetadata;
  execute: SkillFn;
};
