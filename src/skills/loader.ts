import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { clearSkills, registerSkill } from "./registry.js";
import type { Skill } from "./types.js";

const log = createSubsystemLogger("skills:loader");

export function isSkill(value: unknown): value is Skill {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.metadata !== "object" || !obj.metadata) return false;
  if (typeof obj.execute !== "function") return false;
  const meta = obj.metadata as Record<string, unknown>;
  return (
    typeof meta.name === "string" &&
    typeof meta.description === "string" &&
    typeof meta.financial === "boolean" &&
    typeof meta.client_facing === "boolean" &&
    typeof meta.read_only === "boolean"
  );
}

export type SkillLoadResult = {
  loaded: string[];
  failed: Array<{ file: string; error: string }>;
};

export async function loadSkillsFromDir(skillsDir: string): Promise<SkillLoadResult> {
  clearSkills();
  const result: SkillLoadResult = { loaded: [], failed: [] };

  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    log.info(`skills directory not found or empty: ${skillsDir}`);
    return result;
  }

  const skillFiles = entries.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of skillFiles) {
    const filePath = path.join(skillsDir, file);
    try {
      const url = pathToFileURL(filePath).href;
      const mod = await import(url);
      const skill = mod.default ?? mod.skill ?? mod;
      if (!isSkill(skill)) {
        result.failed.push({ file, error: "module does not export a valid Skill object" });
        log.warn(`invalid skill module: ${file}`);
        continue;
      }
      registerSkill(skill);
      result.loaded.push(skill.metadata.name);
      log.info(`loaded skill: ${skill.metadata.name} (${file})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ file, error: message });
      log.error(`failed to load skill ${file}: ${message}`);
    }
  }

  return result;
}
