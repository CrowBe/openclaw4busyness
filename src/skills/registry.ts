import type { Skill } from "./types.js";

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
