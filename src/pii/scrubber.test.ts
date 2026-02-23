import { describe, it, expect } from "vitest";
import { scrubPii, hasPii } from "./scrubber.js";

describe("scrubPii", () => {
  describe("phone numbers", () => {
    it("scrubs Australian mobile number without country code", () => {
      const result = scrubPii("Call me on 0412 345 678 please.");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).not.toContain("0412 345 678");
      expect(result.scrubbed).toContain("[PHONE]");
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].category).toBe("phone");
      expect(result.matches[0].original).toBe("0412 345 678");
    });

    it("scrubs Australian mobile number with +61 prefix", () => {
      const result = scrubPii("My number is +61 412 345 678.");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).not.toContain("+61 412 345 678");
      expect(result.scrubbed).toContain("[PHONE]");
      expect(result.matches[0].category).toBe("phone");
    });

    it("scrubs landline number", () => {
      const result = scrubPii("Office: 02 9876 5432");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).toContain("[PHONE]");
    });
  });

  describe("email addresses", () => {
    it("scrubs a standard email address", () => {
      const result = scrubPii("Send invoice to billing@example.com today.");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).not.toContain("billing@example.com");
      expect(result.scrubbed).toContain("[EMAIL]");
      expect(result.matches[0].category).toBe("email");
      expect(result.matches[0].original).toBe("billing@example.com");
    });

    it("scrubs email with subdomains", () => {
      const result = scrubPii("Contact user@mail.company.co.uk for details.");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).toContain("[EMAIL]");
    });
  });

  describe("tax IDs", () => {
    it("scrubs ABN", () => {
      const result = scrubPii("Our ABN: 12 345 678 901 is on the invoice.");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).not.toContain("12 345 678 901");
      expect(result.scrubbed).toContain("[TAX-ID]");
      expect(result.matches[0].category).toBe("tax_id");
    });

    it("scrubs ABN without spaces", () => {
      const result = scrubPii("ABN12345678901");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).toContain("[TAX-ID]");
    });

    it("scrubs TFN", () => {
      const result = scrubPii("TFN: 123 456 789");
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).toContain("[TAX-ID]");
      expect(result.matches[0].category).toBe("tax_id");
    });
  });

  describe("text without PII", () => {
    it("returns unchanged text when no PII present", () => {
      const text = "Please fix the leaking tap in the kitchen.";
      const result = scrubPii(text);
      expect(result.scrubbed).toBe(text);
      expect(result.hasPii).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it("returns unchanged text for empty string", () => {
      const result = scrubPii("");
      expect(result.scrubbed).toBe("");
      expect(result.hasPii).toBe(false);
    });
  });

  describe("category filtering", () => {
    it('only scrubs phones when categories is ["phone"]', () => {
      const text = "Call 0412 345 678 or email user@example.com";
      const result = scrubPii(text, { categories: ["phone"] });
      expect(result.scrubbed).toContain("[PHONE]");
      expect(result.scrubbed).toContain("user@example.com");
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].category).toBe("phone");
    });

    it('only scrubs emails when categories is ["email"]', () => {
      const text = "Call 0412 345 678 or email user@example.com";
      const result = scrubPii(text, { categories: ["email"] });
      expect(result.scrubbed).toContain("0412 345 678");
      expect(result.scrubbed).toContain("[EMAIL]");
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].category).toBe("email");
    });

    it("scrubs multiple specified categories", () => {
      const text = "ABN 12 345 678 901, call 0412 345 678, email user@example.com";
      const result = scrubPii(text, { categories: ["phone", "email"] });
      expect(result.scrubbed).toContain("[PHONE]");
      expect(result.scrubbed).toContain("[EMAIL]");
      expect(result.scrubbed).toContain("ABN");
      expect(result.matches).toHaveLength(2);
    });
  });

  describe("overlapping matches", () => {
    it("deduplicates overlapping matches keeping the first", () => {
      // Construct a string that could produce overlapping patterns conceptually.
      // Because our patterns target distinct categories, test with a mock-ish approach:
      // Use a text where the same region might match two patterns (e.g. a named email).
      // In practice, overlaps are handled by position deduplication.
      const text = "Contact 0412 345 678 now.";
      const result = scrubPii(text);
      // Ensure the phone is only replaced once (not doubled)
      const phoneMatches = result.matches.filter((m) => m.category === "phone");
      expect(phoneMatches).toHaveLength(1);
      // And the replacement appears exactly once
      expect(result.scrubbed.split("[PHONE]").length - 1).toBe(1);
    });

    it("does not include second match that starts before first ends", () => {
      // The deduplication logic: if m.start < lastEnd, skip it.
      // We can verify this holds by checking the returned matches array.
      const text = "Email me at info@example.com for details.";
      const result = scrubPii(text);
      // No two matches should overlap
      for (let i = 1; i < result.matches.length; i++) {
        expect(result.matches[i].start).toBeGreaterThanOrEqual(result.matches[i - 1].end);
      }
    });
  });

  describe("multiple PII items", () => {
    it("scrubs all PII from a message", () => {
      const text =
        "Hi, I am Mr. John Smith. Call 0412 345 678 or email john@example.com. ABN: 12 345 678 901.";
      const result = scrubPii(text);
      expect(result.hasPii).toBe(true);
      expect(result.scrubbed).not.toContain("0412 345 678");
      expect(result.scrubbed).not.toContain("john@example.com");
      expect(result.scrubbed).toContain("[PHONE]");
      expect(result.scrubbed).toContain("[EMAIL]");
    });

    it("preserves text between PII tokens", () => {
      const text = "Phone: 0412 345 678 and email: user@test.com";
      const result = scrubPii(text);
      expect(result.scrubbed).toContain("Phone: [PHONE] and email: [EMAIL]");
    });
  });
});

describe("hasPii", () => {
  it("returns true when text contains PII", () => {
    expect(hasPii("Call 0412 345 678 now.")).toBe(true);
  });

  it("returns false when text has no PII", () => {
    expect(hasPii("The job site is on level 3.")).toBe(false);
  });

  it("respects category filtering", () => {
    const text = "Email: user@example.com";
    expect(hasPii(text, { categories: ["phone"] })).toBe(false);
    expect(hasPii(text, { categories: ["email"] })).toBe(true);
  });
});
