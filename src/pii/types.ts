export type PiiCategory = "phone" | "email" | "address" | "name" | "tax_id" | "card";

export type PiiMatch = {
  category: PiiCategory;
  original: string;
  replacement: string;
  start: number;
  end: number;
};

export type ScrubResult = {
  scrubbed: string;
  matches: PiiMatch[];
  hasPii: boolean;
};

export type ScrubOptions = {
  categories?: PiiCategory[];
};
