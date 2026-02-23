import { describe, it, expect } from "vitest";
import type { SkillMetadata } from "../skills/types.js";
import { checkHitlRequired } from "./middleware.js";

describe("HITL middleware - skill gate", () => {
  it("requires approval for financial skills", () => {
    const meta: SkillMetadata = {
      name: "quote-draft",
      description: "Prepare quote",
      financial: true,
      client_facing: true,
      read_only: false,
    };
    const result = checkHitlRequired(meta);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("financial");
    }
  });

  it("requires approval for client-facing non-financial skills", () => {
    const meta: SkillMetadata = {
      name: "inquiry-triage",
      description: "Triage inquiry",
      financial: false,
      client_facing: true,
      read_only: false,
    };
    const result = checkHitlRequired(meta);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("client_facing");
    }
  });

  it("requires approval for system-modifying non-read-only skills", () => {
    const meta: SkillMetadata = {
      name: "voice-note",
      description: "Voice note",
      financial: false,
      client_facing: false,
      read_only: false,
    };
    const result = checkHitlRequired(meta);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("system_modify");
    }
  });

  it("does not require approval for read-only skills", () => {
    const meta: SkillMetadata = {
      name: "audit-log",
      description: "Query audit log",
      financial: false,
      client_facing: false,
      read_only: true,
    };
    const result = checkHitlRequired(meta);
    expect(result.requiresApproval).toBe(false);
  });
});
