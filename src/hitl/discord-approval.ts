export type HitlDiscordApprovalMessage = {
  content: string;
  channelId: string;
  actionId: string;
};

/**
 * Send a HITL approval message to a Discord channel via the REST API.
 * The token must be a valid Discord bot token.
 * Errors are re-thrown so the caller can decide whether to swallow them.
 */
export async function sendHitlApprovalMessage(params: {
  message: HitlDiscordApprovalMessage;
  token: string;
}): Promise<void> {
  const { message, token } = params;
  const url = `https://discord.com/api/v10/channels/${message.channelId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: message.content }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(`Discord channel message failed: HTTP ${response.status} — ${body}`);
  }
}

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
