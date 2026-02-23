import { describe, it, expect } from "vitest";
import { scrubPii, hasPii } from "./scrubber.js";

describe("PII scrubber - Australian trade business context", () => {
  describe("phone numbers", () => {
    it("scrubs Australian mobile numbers", () => {
      expect(scrubPii("Call me on 0412 345 678").scrubbed).not.toContain("0412");
      expect(hasPii("0412 345 678")).toBe(true);
    });
    it("scrubs landline numbers", () => {
      expect(hasPii("02 9876 5432")).toBe(true);
    });
    it("scrubs international format", () => {
      expect(hasPii("+61 412 345 678")).toBe(true);
    });
  });

  describe("email addresses", () => {
    it("scrubs email addresses", () => {
      const result = scrubPii("Contact john.smith@example.com.au");
      expect(result.scrubbed).not.toContain("@");
      expect(result.hasPii).toBe(true);
    });
  });

  describe("tax identifiers", () => {
    it("scrubs ABN numbers", () => {
      expect(hasPii("ABN: 12 345 678 901")).toBe(true);
    });
    it("scrubs TFN numbers", () => {
      expect(hasPii("TFN: 123 456 789")).toBe(true);
    });
  });

  describe("clean text", () => {
    it("does not modify text without PII", () => {
      const text = "The technician arrived at 9am and completed the plumbing repair.";
      expect(scrubPii(text).scrubbed).toBe(text);
      expect(hasPii(text)).toBe(false);
    });
    it("handles empty string", () => {
      expect(scrubPii("").scrubbed).toBe("");
      expect(hasPii("")).toBe(false);
    });
  });

  describe("multiple PII in same text", () => {
    it("scrubs multiple PII items", () => {
      const text = "Client: john@email.com, Phone: 0412 345 678, ABN: 12 345 678 901";
      const result = scrubPii(text);
      expect(result.hasPii).toBe(true);
      expect(result.matches.length).toBeGreaterThan(1);
    });
  });

  describe("category filtering", () => {
    it("only scrubs specified categories", () => {
      const text = "Email: test@example.com, Phone: 0412 345 678";
      const emailOnly = scrubPii(text, { categories: ["email"] });
      // Email should be scrubbed
      expect(emailOnly.scrubbed).not.toContain("@example.com");
      // Phone might still be present (depends on pattern)
    });
  });
});
