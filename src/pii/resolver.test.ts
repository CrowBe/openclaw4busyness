import { describe, it, expect } from "vitest";
import { buildResolutionMap, resolveTokens } from "./resolver.js";
import { scrubPii } from "./scrubber.js";

describe("buildResolutionMap", () => {
  it("builds entries from a scrub result with one match", () => {
    const result = scrubPii("Call 0412 345 678 please.");
    const map = buildResolutionMap(result);
    expect(map.entries).toHaveLength(1);
    expect(map.entries[0].token).toBe("[PHONE]");
    expect(map.entries[0].occurrence).toBe(0);
    expect(map.entries[0].original).toBe("0412 345 678");
    expect(map.entries[0].category).toBe("phone");
  });

  it("tracks occurrence indices for repeated token types", () => {
    const result = scrubPii("Call 0412 345 678 or 0498 765 432.");
    const map = buildResolutionMap(result);
    const phones = map.entries.filter((e) => e.token === "[PHONE]");
    expect(phones).toHaveLength(2);
    expect(phones[0].occurrence).toBe(0);
    expect(phones[1].occurrence).toBe(1);
    expect(phones[0].original).toBe("0412 345 678");
    expect(phones[1].original).toBe("0498 765 432");
  });

  it("returns empty entries for text without PII", () => {
    const result = scrubPii("No PII here.");
    const map = buildResolutionMap(result);
    expect(map.entries).toHaveLength(0);
  });

  it("handles mixed categories", () => {
    const result = scrubPii("Phone: 0412 345 678, email: user@example.com");
    const map = buildResolutionMap(result);
    expect(map.entries).toHaveLength(2);
    const categories = map.entries.map((e) => e.category);
    expect(categories).toContain("phone");
    expect(categories).toContain("email");
  });
});

describe("resolveTokens", () => {
  it("restores a single PII value", () => {
    const result = scrubPii("Call 0412 345 678 please.");
    const map = buildResolutionMap(result);
    const resolved = resolveTokens(result.scrubbed, map);
    expect(resolved).toBe("Call 0412 345 678 please.");
  });

  it("restores multiple PII values of the same type", () => {
    const result = scrubPii("Call 0412 345 678 or 0498 765 432.");
    const map = buildResolutionMap(result);
    const resolved = resolveTokens(result.scrubbed, map);
    expect(resolved).toBe("Call 0412 345 678 or 0498 765 432.");
  });

  it("restores mixed PII types", () => {
    const original = "Phone: 0412 345 678 and email: user@example.com";
    const result = scrubPii(original);
    const map = buildResolutionMap(result);
    const resolved = resolveTokens(result.scrubbed, map);
    expect(resolved).toBe(original);
  });

  it("returns unchanged text when map is empty", () => {
    const text = "No PII here.";
    const result = scrubPii(text);
    const map = buildResolutionMap(result);
    const resolved = resolveTokens(result.scrubbed, map);
    expect(resolved).toBe(text);
  });

  it("round-trips scrub and resolve for complex text", () => {
    const original = "Hi, call 0412 345 678 or email billing@example.com. ABN: 12 345 678 901.";
    const result = scrubPii(original);
    const map = buildResolutionMap(result);
    const resolved = resolveTokens(result.scrubbed, map);
    expect(resolved).toBe(original);
  });
});
