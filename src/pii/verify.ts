import { getAuditStore } from "../audit/store.js";
import type { AuditEvent } from "../audit/types.js";
import { hasPii, scrubPii } from "./scrubber.js";
import type { PiiCategory } from "./types.js";

export type PiiViolation = {
  auditEventId: string;
  field: "detail";
  categories: PiiCategory[];
  snippet: string;
};

export type PiiVerifyResult = {
  scanned: number;
  violations: PiiViolation[];
  clean: boolean;
};

/**
 * Scan recent audit log entries for unredacted PII.
 * Returns a report listing any violations found.
 *
 * @param limit - How many recent audit events to scan (default 100).
 * @param dbPath - Optional audit database path (uses default when omitted).
 */
export function verifyNoPiiInAuditLog(limit = 100, dbPath?: string): PiiVerifyResult {
  const store = getAuditStore(dbPath);
  const events: AuditEvent[] = store.query({ limit });
  const violations: PiiViolation[] = [];

  for (const event of events) {
    if (!event.detail) {
      continue;
    }
    if (hasPii(event.detail)) {
      const result = scrubPii(event.detail);
      const categories = [...new Set(result.matches.map((m) => m.category))];
      violations.push({
        auditEventId: event.id,
        field: "detail",
        categories,
        // Show a short snippet (first 120 chars) for context without leaking full PII
        snippet: event.detail.slice(0, 120) + (event.detail.length > 120 ? "..." : ""),
      });
    }
  }

  return {
    scanned: events.length,
    violations,
    clean: violations.length === 0,
  };
}

/**
 * Scan arbitrary text for PII. Useful for verifying model API
 * responses or Discord messages before they are sent.
 */
export function verifyTextClean(text: string): { clean: boolean; categories: PiiCategory[] } {
  const result = scrubPii(text);
  if (!result.hasPii) {
    return { clean: true, categories: [] };
  }
  const categories = [...new Set(result.matches.map((m) => m.category))];
  return { clean: false, categories };
}
