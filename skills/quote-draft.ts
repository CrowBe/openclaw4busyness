import { scrubPii } from "../src/pii/scrubber.js";
import type { Skill } from "../src/skills/types.js";

type QuoteLineItem = {
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

const quoteDraftSkill: Skill = {
  metadata: {
    name: "quote-draft",
    description:
      "Prepare a draft quote for a job. The quote will be held in the HITL queue for approval before sending to the client.",
    financial: true, // triggers HITL
    client_facing: true, // triggers HITL
    read_only: false,
  },
  async execute(args, ctx) {
    const client_name = typeof args.client_name === "string" ? args.client_name.trim() : "";
    if (!client_name) {
      return { ok: false, message: "client_name is required" };
    }

    const job_description =
      typeof args.job_description === "string" ? args.job_description.trim() : "";
    if (!job_description) {
      return { ok: false, message: "job_description is required" };
    }

    // Scrub PII from description
    const descScrub = scrubPii(job_description);

    // Parse line items
    const rawItems = Array.isArray(args.line_items) ? (args.line_items as unknown[]) : [];
    const lineItems: QuoteLineItem[] = rawItems.map((item) => {
      const i = item as Record<string, unknown>;
      const qty = typeof i.qty === "number" ? i.qty : 1;
      const unit_price = typeof i.unit_price === "number" ? i.unit_price : 0;
      return {
        description: typeof i.description === "string" ? i.description : "Service",
        qty,
        unit_price,
        line_total: qty * unit_price,
      };
    });

    const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    const gst_rate = 0.1; // Australian GST
    const gst = subtotal * gst_rate;
    const total = subtotal + gst;

    const draft = {
      client_name,
      job_description: descScrub.scrubbed,
      line_items: lineItems,
      subtotal,
      gst,
      total,
      currency: "AUD",
      created_at: new Date().toISOString(),
      status: "draft",
    };

    const piiMsg = descScrub.hasPii ? " (PII scrubbed from description)" : "";

    // This skill has financial=true and client_facing=true,
    // so the HITL middleware will intercept before execution completes.
    // The message here is a preview for the approver.
    return {
      ok: true,
      message: `Quote draft prepared for ${client_name}${piiMsg}. Total: AUD ${total.toFixed(2)} (incl. GST). Pending HITL approval before sending.`,
      data: { draft },
    };
  },
};

export default quoteDraftSkill;
