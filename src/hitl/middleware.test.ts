import { describe, it, expect } from "vitest";
import type { SkillMetadata } from "../skills/types.js";
import { checkHitlRequired } from "./middleware.js";

describe("checkHitlRequired", () => {
  it("requires approval for financial skills", () => {
    const metadata: SkillMetadata = {
      name: "send_invoice",
      description: "Sends an invoice to a client",
      financial: true,
      client_facing: false,
      read_only: false,
    };

    const result = checkHitlRequired(metadata);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("financial");
      expect(result.reason).toContain("send_invoice");
      expect(result.reason).toContain("financial");
    }
  });

  it("requires approval for client-facing skills", () => {
    const metadata: SkillMetadata = {
      name: "send_email",
      description: "Sends an email to a client",
      financial: false,
      client_facing: true,
      read_only: false,
    };

    const result = checkHitlRequired(metadata);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("client_facing");
      expect(result.reason).toContain("send_email");
      expect(result.reason).toContain("client-facing");
    }
  });

  it("requires system_modify approval for non-read-only skills", () => {
    const metadata: SkillMetadata = {
      name: "update_config",
      description: "Updates system configuration",
      financial: false,
      client_facing: false,
      read_only: false,
    };

    const result = checkHitlRequired(metadata);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("system_modify");
      expect(result.reason).toContain("update_config");
    }
  });

  it("does not require approval for read-only skills", () => {
    const metadata: SkillMetadata = {
      name: "list_invoices",
      description: "Lists all invoices",
      financial: false,
      client_facing: false,
      read_only: true,
    };

    const result = checkHitlRequired(metadata);
    expect(result.requiresApproval).toBe(false);
  });

  it("prioritizes financial over client_facing when both are true", () => {
    const metadata: SkillMetadata = {
      name: "charge_and_notify",
      description: "Charges and notifies client",
      financial: true,
      client_facing: true,
      read_only: false,
    };

    const result = checkHitlRequired(metadata);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("financial");
    }
  });

  it("read_only financial skill still requires approval", () => {
    const metadata: SkillMetadata = {
      name: "read_financials",
      description: "Reads financial records",
      financial: true,
      client_facing: false,
      read_only: true,
    };

    const result = checkHitlRequired(metadata);
    expect(result.requiresApproval).toBe(true);
    if (result.requiresApproval) {
      expect(result.actionType).toBe("financial");
    }
  });
});
