export type HitlDiscordApprovalMessage = {
  content: string;
  channelId: string;
  actionId: string;
};

export function buildHitlApprovalMessage(params: {
  actionId: string;
  skillName: string;
  actionType: string;
  proposedData: unknown;
  requestedBy: string;
  expiresAt: string;
  approvalChannelId: string;
}): HitlDiscordApprovalMessage {
  const preview = JSON.stringify(params.proposedData, null, 2).slice(0, 800);
  const expiresIn = formatRelativeTime(params.expiresAt);

  const content = [
    `**HITL Approval Required** — Action ID: \`${params.actionId}\``,
    `**Skill:** \`${params.skillName}\``,
    `**Type:** \`${params.actionType}\``,
    `**Requested by:** <@${params.requestedBy}>`,
    `**Expires:** ${expiresIn}`,
    ``,
    `**Proposed Action:**`,
    "```json",
    preview,
    "```",
    ``,
    `React with ✅ to **approve** or ❌ to **reject**.`,
    `Or use \`hitl accept ${params.actionId}\` / \`hitl reject ${params.actionId} <reason>\``,
  ].join("\n");

  return {
    content,
    channelId: params.approvalChannelId,
    actionId: params.actionId,
  };
}

function formatRelativeTime(isoTimestamp: string): string {
  const ms = new Date(isoTimestamp).getTime() - Date.now();
  if (ms < 0) {
    return "expired";
  }
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}
