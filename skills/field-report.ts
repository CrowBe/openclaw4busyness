import { scrubPii } from "../src/pii/scrubber.js";
import type { Skill } from "../src/skills/types.js";

type FieldReportData = {
  job_id: string;
  worker_name: string;
  site_address: string;
  work_description: string;
  materials_used?: string;
  issues_found?: string;
  time_on_site_hours?: number;
  completed: boolean;
};

const fieldReportSkill: Skill = {
  metadata: {
    name: "field-report",
    description:
      "Submit a structured field report from a site visit. Scrubs PII. Requires HITL approval before filing.",
    financial: false,
    client_facing: false,
    read_only: false, // modifies reports
  },
  async execute(args, _ctx) {
    const job_id = typeof args.job_id === "string" ? args.job_id.trim() : "";
    if (!job_id) {
      return { ok: false, message: "job_id is required" };
    }

    const worker_name = typeof args.worker_name === "string" ? args.worker_name.trim() : "";
    if (!worker_name) {
      return { ok: false, message: "worker_name is required" };
    }

    const work_description =
      typeof args.work_description === "string" ? args.work_description.trim() : "";
    if (!work_description) {
      return { ok: false, message: "work_description is required" };
    }

    const site_address = typeof args.site_address === "string" ? args.site_address.trim() : "";
    const materials_used =
      typeof args.materials_used === "string" ? args.materials_used.trim() : undefined;
    const issues_found =
      typeof args.issues_found === "string" ? args.issues_found.trim() : undefined;
    const time_on_site_hours =
      typeof args.time_on_site_hours === "number" ? args.time_on_site_hours : undefined;
    const completed = Boolean(args.completed);

    // Scrub PII from free-text fields
    const descScrub = scrubPii(work_description);
    const issuesScrub = issues_found ? scrubPii(issues_found) : null;
    const materialsScrub = materials_used ? scrubPii(materials_used) : null;

    const hasPii =
      descScrub.hasPii || (issuesScrub?.hasPii ?? false) || (materialsScrub?.hasPii ?? false);

    const report: FieldReportData = {
      job_id,
      worker_name,
      site_address,
      work_description: descScrub.scrubbed,
      materials_used: materialsScrub?.scrubbed ?? materials_used,
      issues_found: issuesScrub?.scrubbed ?? issues_found,
      time_on_site_hours,
      completed,
    };

    const piiMsg = hasPii ? " (PII scrubbed from report)" : "";
    const completionMsg = completed ? "Job marked complete." : "Job in progress.";

    return {
      ok: true,
      message: `Field report submitted for job ${job_id}${piiMsg}. ${completionMsg}`,
      data: { report },
    };
  },
};

export default fieldReportSkill;
