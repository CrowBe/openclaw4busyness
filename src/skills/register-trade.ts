/**
 * Static registry for trade business skills.
 *
 * Skills are imported and registered here to ensure they are compiled
 * as part of the main bundle. Dynamic file loading of TypeScript
 * modules is not supported at runtime; use this static approach instead.
 */
import auditLogSkill from "../../skills/audit-log.js";
import fieldReportSkill from "../../skills/field-report.js";
import hitlApproveSkill from "../../skills/hitl-approve.js";
import inquiryTriageSkill from "../../skills/inquiry-triage.js";
import quoteDraftSkill from "../../skills/quote-draft.js";
import voiceNoteSkill from "../../skills/voice-note.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { registerSkill } from "./registry.js";

const log = createSubsystemLogger("skills:register-trade");

export function registerTradeSkills(): void {
  const skills = [
    auditLogSkill,
    fieldReportSkill,
    hitlApproveSkill,
    inquiryTriageSkill,
    quoteDraftSkill,
    voiceNoteSkill,
  ];

  for (const skill of skills) {
    registerSkill(skill);
    log.info(`registered trade skill: ${skill.metadata.name}`);
  }
}
