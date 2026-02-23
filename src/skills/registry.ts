import { getAuditStore } from "../audit/store.js";
import type { Skill, SkillContext, SkillResult } from "./types.js";

const registry = new Map<string, Skill>();

export function registerSkill(skill: Skill): void {
  registry.set(skill.metadata.name, skill);
}

export function getSkill(name: string): Skill | undefined {
  return registry.get(name);
}

export function listSkills(): Skill[] {
  return [...registry.values()];
}

export function clearSkills(): void {
  registry.clear();
}

/**
 * Execute a registered skill by name, emitting audit events on completion.
 * Returns undefined if no skill with the given name is registered.
 */
export async function executeSkill(
  name: string,
  args: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult | undefined> {
  const skill = registry.get(name);
  if (!skill) {
    return undefined;
  }

  const audit = getAuditStore();
  const actor = ctx.requestedBy ?? "unknown";

  try {
    const result = await skill.execute(args, ctx);

    audit.log({
      event_type: result.ok ? "skill.executed" : "skill.rejected",
      actor,
      skill_name: name,
      detail: result.message,
      session_key: ctx.sessionKey,
      channel_id: ctx.channelId,
    });

    return result;
  } catch (err) {
    audit.log({
      event_type: "skill.rejected",
      actor,
      skill_name: name,
      detail: `skill "${name}" threw: ${String(err)}`,
      session_key: ctx.sessionKey,
      channel_id: ctx.channelId,
    });
    throw err;
  }
}
