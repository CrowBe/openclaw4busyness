import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditStore } from "../audit/store.js";
import { verifyNoPiiInAuditLog, verifyTextClean } from "./verify.js";

// Mock the subsystem logger
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(),
    isEnabled: vi.fn(() => false),
    subsystem: "test",
  }),
}));

let dbPath: string;

beforeEach(() => {
  dbPath = path.join("/tmp", `audit-verify-test-${randomUUID()}.db`);
});

afterEach(() => {
  try {
    const fs = require("node:fs");
    fs.unlinkSync(dbPath);
  } catch {
    // ignore
  }
});

describe("verifyNoPiiInAuditLog", () => {
  it("reports clean when audit log has no PII", () => {
    const store = getAuditStore(dbPath);
    store.log({
      event_type: "skill.executed",
      actor: "user-123",
      skill_name: "voice-note",
      detail: "Job note saved. Note ID: abc-123",
    });

    const result = verifyNoPiiInAuditLog(100, dbPath);
    expect(result.clean).toBe(true);
    expect(result.scanned).toBe(1);
    expect(result.violations).toHaveLength(0);
  });

  it("detects PII in audit log detail field", () => {
    const store = getAuditStore(dbPath);
    store.log({
      event_type: "skill.executed",
      actor: "user-123",
      skill_name: "voice-note",
      detail: "Transcribed note for client. Call 0412 345 678 for follow-up.",
    });

    const result = verifyNoPiiInAuditLog(100, dbPath);
    expect(result.clean).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].categories).toContain("phone");
  });

  it("detects multiple PII categories", () => {
    const store = getAuditStore(dbPath);
    store.log({
      event_type: "skill.executed",
      actor: "user-123",
      detail: "Contact john@example.com or 0412 345 678.",
    });

    const result = verifyNoPiiInAuditLog(100, dbPath);
    expect(result.clean).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].categories).toContain("phone");
    expect(result.violations[0].categories).toContain("email");
  });

  it("returns empty result when audit log is empty", () => {
    // Create the store so the DB file exists, but add no entries
    getAuditStore(dbPath);
    const result = verifyNoPiiInAuditLog(100, dbPath);
    expect(result.clean).toBe(true);
    expect(result.scanned).toBe(0);
    expect(result.violations).toHaveLength(0);
  });
});

describe("verifyTextClean", () => {
  it("returns clean for text without PII", () => {
    const result = verifyTextClean("The plumber fixed the kitchen tap.");
    expect(result.clean).toBe(true);
    expect(result.categories).toHaveLength(0);
  });

  it("detects phone numbers", () => {
    const result = verifyTextClean("Call 0412 345 678 for the job.");
    expect(result.clean).toBe(false);
    expect(result.categories).toContain("phone");
  });

  it("detects email addresses", () => {
    const result = verifyTextClean("Email admin@example.com for info.");
    expect(result.clean).toBe(false);
    expect(result.categories).toContain("email");
  });
});
