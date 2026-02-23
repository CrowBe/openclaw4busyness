import type { PiiCategory, PiiMatch, ScrubOptions, ScrubResult } from "./types.js";

// Patterns for common Australian/UK trade business PII
const PATTERNS: Record<PiiCategory, RegExp> = {
  phone: /(?:\+?61|0)[0-9\s\-().]{8,14}[0-9]/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  address:
    /\b\d+\s+[A-Z][a-zA-Z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Way|Lane|Ln|Place|Pl|Boulevard|Blvd)\b/gi,
  name: /\b(?:Mr|Mrs|Ms|Dr|Prof)\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g,
  tax_id: /\b(?:ABN|ACN|TFN)[:\s#]*\d[\d\s]{8,12}\d\b/gi,
  card: /\b(?:\d{4}[\s-]){3}\d{4}\b/g,
};

const REPLACEMENTS: Record<PiiCategory, string> = {
  phone: "[PHONE]",
  email: "[EMAIL]",
  address: "[ADDRESS]",
  name: "[NAME]",
  tax_id: "[TAX-ID]",
  card: "[CARD]",
};

export function scrubPii(text: string, opts?: ScrubOptions): ScrubResult {
  const categories = opts?.categories ?? (Object.keys(PATTERNS) as PiiCategory[]);
  const matches: PiiMatch[] = [];

  for (const category of categories) {
    const pattern = new RegExp(PATTERNS[category].source, PATTERNS[category].flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const replacement = REPLACEMENTS[category];
      matches.push({
        category,
        original: match[0],
        replacement,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Sort by start position and apply replacements in reverse to maintain offsets
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the first one)
  const deduped: PiiMatch[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      deduped.push(m);
      lastEnd = m.end;
    }
  }

  // Apply replacements in reverse
  let scrubbed = text;
  for (const m of deduped.toReversed()) {
    scrubbed = scrubbed.slice(0, m.start) + m.replacement + scrubbed.slice(m.end);
  }

  return { scrubbed, matches: deduped, hasPii: deduped.length > 0 };
}

export function hasPii(text: string, opts?: ScrubOptions): boolean {
  return scrubPii(text, opts).hasPii;
}
