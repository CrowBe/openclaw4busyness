import { scrubPii } from "../src/pii/scrubber.js";
import type { Skill } from "../src/skills/types.js";

type InquiryCategory = "new_job" | "existing_job" | "complaint" | "invoice" | "general";
type TriagePriority = "urgent" | "normal" | "low";

const URGENCY_KEYWORDS = ["urgent", "emergency", "asap", "flooding", "gas leak", "burst"];
const COMPLAINT_KEYWORDS = ["complaint", "unhappy", "poor", "bad", "refund", "dissatisfied"];
const INVOICE_KEYWORDS = ["invoice", "bill", "payment", "overdue", "receipt"];
const EXISTING_JOB_KEYWORDS = ["job", "booking", "appointment", "scheduled", "technician"];

function categorize(text: string): InquiryCategory {
  const lower = text.toLowerCase();
  if (COMPLAINT_KEYWORDS.some((k) => lower.includes(k))) return "complaint";
  if (INVOICE_KEYWORDS.some((k) => lower.includes(k))) return "invoice";
  if (EXISTING_JOB_KEYWORDS.some((k) => lower.includes(k))) return "existing_job";
  return "new_job";
}

function prioritize(text: string): TriagePriority {
  const lower = text.toLowerCase();
  if (URGENCY_KEYWORDS.some((k) => lower.includes(k))) return "urgent";
  return "normal";
}

const inquiryTriageSkill: Skill = {
  metadata: {
    name: "inquiry-triage",
    description:
      "Triage an inbound client inquiry. Classifies the inquiry and routes it to the correct queue. Client-facing action requires HITL approval.",
    financial: false,
    client_facing: true, // Routed responses are client-facing
    read_only: false,
  },
  async execute(args, _ctx) {
    const inquiry_text = typeof args.inquiry_text === "string" ? args.inquiry_text.trim() : "";
    if (!inquiry_text) {
      return { ok: false, message: "inquiry_text is required" };
    }

    const sender_name = typeof args.sender_name === "string" ? args.sender_name.trim() : "Unknown";
    const sender_contact =
      typeof args.sender_contact === "string" ? args.sender_contact.trim() : "";

    // Scrub PII from inquiry text
    const scrubResult = scrubPii(inquiry_text);

    const category = categorize(inquiry_text);
    const priority = prioritize(inquiry_text);

    const triage = {
      original_text: scrubResult.scrubbed,
      sender_name,
      sender_contact: scrubResult.hasPii ? "[CONTACT SCRUBBED]" : sender_contact,
      category,
      priority,
      suggested_assignee:
        category === "complaint"
          ? "manager"
          : category === "invoice"
            ? "accounts"
            : "office_operator",
      triaged_at: new Date().toISOString(),
    };

    const urgencyMsg = priority === "urgent" ? " **URGENT**" : "";
    const piiMsg = scrubResult.hasPii ? " (PII scrubbed)" : "";

    return {
      ok: true,
      message: `Inquiry triaged${urgencyMsg} as "${category}"${piiMsg}. Suggested assignee: ${triage.suggested_assignee}.`,
      data: { triage },
    };
  },
};

export default inquiryTriageSkill;
