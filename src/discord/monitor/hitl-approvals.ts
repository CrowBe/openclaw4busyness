/**
 * Discord HITL Approval Monitor (fork-specific)
 *
 * Connects to the gateway as an operator client and listens for
 * "hitl.action.submitted" events. When received, sends a formatted
 * approval prompt to the configured Discord approvals channel.
 * Operators approve/reject via "hitl accept <id>" / "hitl reject <id> [reason]"
 * commands in Discord, or via the hitl-approve skill.
 *
 * When "hitl.action.resolved" is received, sends a follow-up message
 * to the channel noting the outcome.
 */

import { Routes } from "discord-api-types/v10";
import type { OpenClawConfig } from "../../config/config.js";
import { buildGatewayConnectionDetails } from "../../gateway/call.js";
import { GatewayClient } from "../../gateway/client.js";
import type { EventFrame } from "../../gateway/protocol/index.js";
import { buildHitlApprovalMessage } from "../../hitl/discord-approval.js";
import type { PendingAction } from "../../hitl/types.js";
import { logError, logInfo } from "../../logger.js";
import type { RuntimeEnv } from "../../runtime.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../utils/message-channel.js";
import { createDiscordClient } from "../send.shared.js";

const GATEWAY_CLIENT_DISPLAY_NAME = "Discord HITL Approvals";

export type DiscordHitlApprovalConfig = {
  /** Discord channel ID for the #approvals channel. Required. */
  approvalChannelId: string;
  /** Whether the HITL approval monitor is enabled. Default: true. */
  enabled?: boolean;
};

export type DiscordHitlApprovalHandlerOpts = {
  config: DiscordHitlApprovalConfig;
  token: string;
  accountId: string;
  cfg: OpenClawConfig;
  env: RuntimeEnv;
  gatewayUrl?: string;
};

type PendingNotification = {
  discordMessageId: string;
};

export class DiscordHitlApprovalHandler {
  private gatewayClient: GatewayClient | null = null;
  private pendingMessages = new Map<string, PendingNotification>();
  private opts: DiscordHitlApprovalHandlerOpts;
  private started = false;

  constructor(opts: DiscordHitlApprovalHandlerOpts) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const { config } = this.opts;
    if (config.enabled === false) {
      return;
    }

    if (!config.approvalChannelId) {
      logError("hitl-approvals: approvalChannelId is not configured; monitor disabled");
      return;
    }

    this.started = true;

    const { url: gatewayUrl } = buildGatewayConnectionDetails({
      config: this.opts.cfg,
      url: this.opts.gatewayUrl,
    });

    this.gatewayClient = new GatewayClient({
      url: gatewayUrl,
      clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      clientDisplayName: GATEWAY_CLIENT_DISPLAY_NAME,
      mode: GATEWAY_CLIENT_MODES.BACKEND,
      // Reuse operator.approvals scope — HITL events share the same guard
      scopes: ["operator.approvals"],
      onEvent: (evt) => this.handleGatewayEvent(evt),
      onHelloOk: () => {
        logInfo("hitl-approvals: connected to gateway");
      },
      onConnectError: (err) => {
        logError(`hitl-approvals: connect error: ${err.message}`);
      },
      onClose: (code, reason) => {
        logInfo(`hitl-approvals: gateway closed: ${code} ${reason}`);
      },
    });

    this.gatewayClient.start();
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.pendingMessages.clear();
    this.gatewayClient?.stop();
    this.gatewayClient = null;
  }

  private handleGatewayEvent(evt: EventFrame): void {
    if (evt.event === "hitl.action.submitted") {
      const { action } = evt.payload as { action: PendingAction };
      void this.handleActionSubmitted(action);
    } else if (evt.event === "hitl.action.resolved") {
      const { action, decision } = evt.payload as {
        action: PendingAction;
        decision: "accepted" | "rejected";
      };
      void this.handleActionResolved(action, decision);
    }
  }

  private async handleActionSubmitted(action: PendingAction): Promise<void> {
    const { config } = this.opts;
    const channelId = config.approvalChannelId;

    const msg = buildHitlApprovalMessage({
      actionId: action.id,
      skillName: action.skill_name,
      actionType: action.action_type,
      proposedData: action.proposed_data,
      requestedBy: action.requested_by,
      expiresAt: action.expires_at,
      approvalChannelId: channelId,
    });

    const { rest, request: discordRequest } = createDiscordClient(
      { token: this.opts.token, accountId: this.opts.accountId },
      this.opts.cfg,
    );

    try {
      const message = (await discordRequest(
        () =>
          rest.post(Routes.channelMessages(channelId), {
            body: { content: msg.content },
          }) as Promise<{ id: string }>,
        "hitl-approval-send",
      )) as { id: string };

      if (message?.id) {
        this.pendingMessages.set(action.id, { discordMessageId: message.id });
        logInfo(
          `hitl-approvals: sent approval request for action ${action.id} to channel ${channelId}`,
        );
      }
    } catch (err) {
      logError(`hitl-approvals: failed to send approval message: ${String(err)}`);
    }
  }

  private async handleActionResolved(
    action: PendingAction,
    decision: "accepted" | "rejected",
  ): Promise<void> {
    const { config } = this.opts;
    const channelId = config.approvalChannelId;

    this.pendingMessages.delete(action.id);

    const decisionEmoji = decision === "accepted" ? "✅" : "❌";
    const content =
      `**HITL Action ${decisionEmoji} ${decision.toUpperCase()}** — \`${action.id}\`\n` +
      `**Skill:** \`${action.skill_name}\`\n` +
      (action.decided_by ? `**Decided by:** <@${action.decided_by}>\n` : "") +
      (action.reject_reason ? `**Reason:** ${action.reject_reason}` : "");

    const { rest, request: discordRequest } = createDiscordClient(
      { token: this.opts.token, accountId: this.opts.accountId },
      this.opts.cfg,
    );

    try {
      await discordRequest(
        () =>
          rest.post(Routes.channelMessages(channelId), {
            body: { content },
          }),
        "hitl-resolution-send",
      );
      logInfo(`hitl-approvals: posted resolution for action ${action.id} (${decision})`);
    } catch (err) {
      logError(`hitl-approvals: failed to post resolution message: ${String(err)}`);
    }
  }
}
