import type { PiiMatch, ScrubResult } from "./types.js";

export type PiiResolutionEntry = {
  token: string;
  occurrence: number;
  original: string;
  category: PiiMatch["category"];
};

/**
 * Ordered map of scrubbed tokens to their original PII values.
 * Built from a ScrubResult so the HITL approval flow can restore real
 * values after operator approval.
 */
export type PiiResolutionMap = {
  entries: PiiResolutionEntry[];
};

/**
 * Build a resolution map from a scrub result. Each entry records the
 * token text, its occurrence index (for repeated token types), and the
 * original PII value. The entries are ordered by position in the
 * scrubbed string so `resolveTokens` can replace them left-to-right.
 */
export function buildResolutionMap(result: ScrubResult): PiiResolutionMap {
  const counts = new Map<string, number>();
  const entries: PiiResolutionEntry[] = [];

  for (const match of result.matches) {
    const count = counts.get(match.replacement) ?? 0;
    entries.push({
      token: match.replacement,
      occurrence: count,
      original: match.original,
      category: match.category,
    });
    counts.set(match.replacement, count + 1);
  }

  return { entries };
}

/**
 * Resolve all scrubbed tokens back to their original PII values.
 * Replaces each token left-to-right using a cursor so prior replacements
 * (which may change string length) don't confuse later lookups.
 */
export function resolveTokens(scrubbed: string, map: PiiResolutionMap): string {
  if (map.entries.length === 0) {
    return scrubbed;
  }

  let resolved = scrubbed;
  // Cursor tracks how far into the string we've already resolved,
  // so each replacement searches only the unprocessed remainder.
  let cursor = 0;

  for (const entry of map.entries) {
    const pos = resolved.indexOf(entry.token, cursor);
    if (pos === -1) {
      continue;
    }

    resolved = resolved.slice(0, pos) + entry.original + resolved.slice(pos + entry.token.length);
    // Advance cursor past the just-inserted original value
    cursor = pos + entry.original.length;
  }

  return resolved;
}
