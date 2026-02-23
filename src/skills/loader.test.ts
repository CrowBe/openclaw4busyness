import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSkill, loadSkillsFromDir } from "./loader.js";
import { clearSkills, listSkills } from "./registry.js";

describe("isSkill", () => {
  it("returns true for a valid skill object", () => {
    const skill = {
      metadata: {
        name: "test-skill",
        description: "A test skill",
        financial: false,
        client_facing: false,
        read_only: true,
      },
      execute: async () => ({ ok: true, message: "done" }),
    };
    expect(isSkill(skill)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isSkill(null)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isSkill("string")).toBe(false);
    expect(isSkill(42)).toBe(false);
  });

  it("returns false when metadata is missing", () => {
    expect(isSkill({ execute: async () => ({}) })).toBe(false);
  });

  it("returns false when execute is not a function", () => {
    const skill = {
      metadata: {
        name: "test",
        description: "test",
        financial: false,
        client_facing: false,
        read_only: true,
      },
      execute: "not-a-function",
    };
    expect(isSkill(skill)).toBe(false);
  });

  it("returns false when metadata is missing required string fields", () => {
    const skill = {
      metadata: {
        name: 42, // wrong type
        description: "test",
        financial: false,
        client_facing: false,
        read_only: true,
      },
      execute: async () => ({}),
    };
    expect(isSkill(skill)).toBe(false);
  });

  it("returns false when metadata financial is not boolean", () => {
    const skill = {
      metadata: {
        name: "test",
        description: "test",
        financial: "yes", // wrong type
        client_facing: false,
        read_only: true,
      },
      execute: async () => ({}),
    };
    expect(isSkill(skill)).toBe(false);
  });

  it("returns false when client_facing is not boolean", () => {
    const skill = {
      metadata: {
        name: "test",
        description: "test",
        financial: false,
        client_facing: 1, // wrong type
        read_only: true,
      },
      execute: async () => ({}),
    };
    expect(isSkill(skill)).toBe(false);
  });

  it("returns false when read_only is not boolean", () => {
    const skill = {
      metadata: {
        name: "test",
        description: "test",
        financial: false,
        client_facing: false,
        read_only: null, // wrong type
      },
      execute: async () => ({}),
    };
    expect(isSkill(skill)).toBe(false);
  });
});

describe("loadSkillsFromDir", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "skills-test-"));
    clearSkills();
  });

  afterEach(async () => {
    clearSkills();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty result for a non-existent directory", async () => {
    const result = await loadSkillsFromDir("/non-existent-dir-12345");
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("returns empty result for an empty directory", async () => {
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("ignores files that are not .ts or .js", async () => {
    await writeFile(path.join(tmpDir, "readme.md"), "# not a skill");
    await writeFile(path.join(tmpDir, "data.json"), "{}");
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("loads a valid .js skill file and registers it", async () => {
    const skillContent = `
const skill = {
  metadata: {
    name: 'hello-world',
    description: 'A simple hello world skill',
    financial: false,
    client_facing: false,
    read_only: true,
  },
  execute: async (args, ctx) => ({ ok: true, message: 'hello' }),
};
export default skill;
`;
    await writeFile(path.join(tmpDir, "hello-world.js"), skillContent);
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toEqual(["hello-world"]);
    expect(result.failed).toEqual([]);

    const skills = listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].metadata.name).toBe("hello-world");
  });

  it("records a failed entry for an invalid skill module (missing metadata)", async () => {
    const invalidContent = `
export default {
  execute: async () => ({ ok: true, message: 'no metadata' }),
};
`;
    await writeFile(path.join(tmpDir, "invalid.js"), invalidContent);
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].file).toBe("invalid.js");
    expect(result.failed[0].error).toBe("module does not export a valid Skill object");
  });

  it("records a failed entry for a module that throws on import", async () => {
    const throwingContent = `throw new Error('deliberate import failure');`;
    await writeFile(path.join(tmpDir, "throwing.js"), throwingContent);
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].file).toBe("throwing.js");
    expect(result.failed[0].error).toContain("deliberate import failure");
  });

  it("loads multiple valid skill files", async () => {
    const makeSkill = (name: string) => `
const skill = {
  metadata: {
    name: '${name}',
    description: 'Skill ${name}',
    financial: false,
    client_facing: false,
    read_only: true,
  },
  execute: async () => ({ ok: true, message: '${name}' }),
};
export default skill;
`;
    await writeFile(path.join(tmpDir, "skill-a.js"), makeSkill("skill-a"));
    await writeFile(path.join(tmpDir, "skill-b.js"), makeSkill("skill-b"));
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toHaveLength(2);
    expect(result.loaded).toContain("skill-a");
    expect(result.loaded).toContain("skill-b");
    expect(result.failed).toEqual([]);
    expect(listSkills()).toHaveLength(2);
  });

  it("handles a mix of valid and invalid skills", async () => {
    const validContent = `
export default {
  metadata: {
    name: 'valid-skill',
    description: 'Valid',
    financial: false,
    client_facing: false,
    read_only: true,
  },
  execute: async () => ({ ok: true, message: 'ok' }),
};
`;
    const invalidContent = `export default { notASkill: true };`;
    await writeFile(path.join(tmpDir, "valid.js"), validContent);
    await writeFile(path.join(tmpDir, "invalid.js"), invalidContent);
    const result = await loadSkillsFromDir(tmpDir);
    expect(result.loaded).toEqual(["valid-skill"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].file).toBe("invalid.js");
  });

  it("clears previously registered skills before loading", async () => {
    // First load
    const skillContent = `
export default {
  metadata: {
    name: 'first-skill',
    description: 'First',
    financial: false,
    client_facing: false,
    read_only: true,
  },
  execute: async () => ({ ok: true, message: 'first' }),
};
`;
    await writeFile(path.join(tmpDir, "first.js"), skillContent);
    await loadSkillsFromDir(tmpDir);
    expect(listSkills()).toHaveLength(1);

    // Second load from empty dir should clear the registry
    const emptyDir = await mkdtemp(path.join(tmpdir(), "skills-empty-"));
    try {
      await loadSkillsFromDir(emptyDir);
      expect(listSkills()).toHaveLength(0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
