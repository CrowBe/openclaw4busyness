# Discord Gateway Config Template

This document shows the OpenClaw JSON5 configuration structure for a trade business Discord server.
Copy and adapt this template into your OpenClaw config file (e.g. `config.json5`) under the
`channels.discord` key.

Skill names listed under `skills:` must exactly match the `metadata.name` field exported by the
corresponding skill module. If the names do not match, the bot will silently ignore messages in
that channel.

---

## Role and Guild IDs

Before filling in the config, collect the following IDs from your Discord server:

| Placeholder              | Where to find it                                                      |
| ------------------------ | --------------------------------------------------------------------- |
| `GUILD_ID_HERE`          | Server Settings > Widget, or right-click server icon (Developer Mode) |
| `FIELD_WORKER_ROLE_ID`   | Server Settings > Roles, right-click the role                         |
| `OPERATOR_ROLE_ID`       | Server Settings > Roles, right-click the role                         |
| `ADMIN_ROLE_ID`          | Server Settings > Roles, right-click the role                         |
| `JOB_REPORTS_CHANNEL_ID` | Right-click the channel (Developer Mode)                              |
| `TIMESHEETS_CHANNEL_ID`  | Right-click the channel (Developer Mode)                              |
| `OPERATIONS_CHANNEL_ID`  | Right-click the channel (Developer Mode)                              |
| `APPROVALS_CHANNEL_ID`   | Right-click the channel (Developer Mode)                              |
| `CONTENT_CHANNEL_ID`     | Right-click the channel (Developer Mode)                              |
| `ADMIN_ONLY_CHANNEL_ID`  | Right-click the channel (Developer Mode)                              |
| `BOT_LOG_CHANNEL_ID`     | Right-click the channel (Developer Mode)                              |

To enable Developer Mode in Discord: User Settings > Advanced > Developer Mode.

---

## Channel / Role Matrix

| Channel        | Roles allowed                        | Bot skills (MVP)                |
| -------------- | ------------------------------------ | ------------------------------- |
| `#job-reports` | Field Worker, Office Operator, Admin | `voice-note`, `field-report`    |
| `#timesheets`  | Field Worker, Office Operator, Admin | _(no bot interaction at MVP)_   |
| `#operations`  | Office Operator, Admin               | `quote-draft`, `inquiry-triage` |
| `#approvals`   | Office Operator, Admin               | `hitl-approve`                  |
| `#content`     | Office Operator, Admin               | _(no bot interaction at MVP)_   |
| `#admin-only`  | Admin only                           | `audit-log`                     |
| `#bot-log`     | Admin only                           | _(logging output only)_         |

---

## JSON5 Config

```json5
{
  channels: {
    discord: {
      // -----------------------------------------------------------------------
      // Global Discord settings
      // -----------------------------------------------------------------------

      // Only respond to direct messages from explicitly paired/allowlisted users.
      // "pairing" sends a one-time code; "open" allows anyone; "disabled" blocks DMs.
      dmPolicy: "pairing",

      // Set to true to also respond to bot accounts (e.g. webhook integrations).
      allowBots: false,

      // Guild (server) entries. One entry per Discord server the bot joins.
      guilds: {
        GUILD_ID_HERE: {
          // Human-readable slug used in logs and session keys.
          slug: "my-trade-co",

          // -----------------------------------------------------------------------
          // Channel configuration
          // Each key is a channel ID (string). You may also use a channel name slug
          // as a fallback key (e.g. "job-reports"), but IDs are more reliable.
          // -----------------------------------------------------------------------
          channels: {
            // --- #job-reports ---------------------------------------------------
            // Field workers submit voice notes and field reports here.
            // Accessible to: Field Worker, Office Operator, Admin
            JOB_REPORTS_CHANNEL_ID: {
              enabled: true,
              // Only respond when the bot is @mentioned.
              requireMention: true,
              // Role IDs that are permitted to interact with the bot in this channel.
              roles: ["FIELD_WORKER_ROLE_ID", "OPERATOR_ROLE_ID", "ADMIN_ROLE_ID"],
              // Skills the bot may invoke in this channel.
              // Names must match `metadata.name` in the skill module.
              skills: ["voice-note", "field-report"],
            },

            // --- #timesheets ----------------------------------------------------
            // Workers log hours. No bot interaction at MVP.
            // Accessible to: Field Worker, Office Operator, Admin
            TIMESHEETS_CHANNEL_ID: {
              enabled: false, // Bot is silent in this channel at MVP.
              roles: ["FIELD_WORKER_ROLE_ID", "OPERATOR_ROLE_ID", "ADMIN_ROLE_ID"],
              // skills: [], // Post-MVP: timesheet-parse, timesheet-approve
            },

            // --- #operations ----------------------------------------------------
            // Office staff manage quotes and incoming inquiries.
            // Accessible to: Office Operator, Admin
            OPERATIONS_CHANNEL_ID: {
              enabled: true,
              requireMention: true,
              roles: ["OPERATOR_ROLE_ID", "ADMIN_ROLE_ID"],
              skills: ["quote-draft", "inquiry-triage"],
            },

            // --- #approvals -----------------------------------------------------
            // Human-in-the-loop approval workflow for quotes, jobs, etc.
            // Accessible to: Office Operator, Admin
            APPROVALS_CHANNEL_ID: {
              enabled: true,
              requireMention: false, // Bot posts approval prompts proactively.
              roles: ["OPERATOR_ROLE_ID", "ADMIN_ROLE_ID"],
              skills: ["hitl-approve"],
            },

            // --- #content -------------------------------------------------------
            // Marketing and content drafting. No bot interaction at MVP.
            // Accessible to: Office Operator, Admin
            CONTENT_CHANNEL_ID: {
              enabled: false, // Bot is silent in this channel at MVP.
              roles: ["OPERATOR_ROLE_ID", "ADMIN_ROLE_ID"],
              // skills: [], // Post-MVP: content-draft, social-post
            },

            // --- #admin-only ----------------------------------------------------
            // Internal admin commands and audit log queries.
            // Accessible to: Admin only
            ADMIN_ONLY_CHANNEL_ID: {
              enabled: true,
              requireMention: true,
              roles: ["ADMIN_ROLE_ID"],
              skills: ["audit-log"],
            },

            // --- #bot-log -------------------------------------------------------
            // Structured logging output from the bot. Read-only for humans.
            // Accessible to: Admin only (view-only for non-admins via Discord permissions)
            BOT_LOG_CHANNEL_ID: {
              enabled: false, // Bot does not respond to messages here; it only writes logs.
              roles: ["ADMIN_ROLE_ID"],
            },
          }, // end channels
        }, // end guild entry
      }, // end guilds
    }, // end discord
  }, // end channels
}
```

---

## Post-MVP Placeholders

The following channels and skills are planned but not active at MVP. They appear as commented-out
entries in the config above. When you are ready to activate them:

1. Create the Discord channel (if it does not already exist).
2. Set the correct permission overrides (see `DISCORD_SETUP_CHECKLIST.md`).
3. Add the channel ID and skill names to the config.
4. Ensure the skill module exports `metadata.name` matching the string in `skills:`.
5. Restart the bot.

| Channel / Skill     | Status   | Notes                                      |
| ------------------- | -------- | ------------------------------------------ |
| `#timesheets` bot   | Post-MVP | timesheet parsing and approval workflow    |
| `#content` bot      | Post-MVP | AI-assisted content and social post drafts |
| `timesheet-parse`   | Post-MVP | Parses submitted timesheet messages        |
| `timesheet-approve` | Post-MVP | Manager approval step for timesheets       |
| `content-draft`     | Post-MVP | Draft marketing copy from a brief          |
| `social-post`       | Post-MVP | Publish approved content to social feeds   |

---

## Notes

- **Channel IDs vs slugs**: Prefer channel IDs as config keys. Name slugs work as a fallback but
  will break if the channel is renamed.
- **`requireMention`**: Set to `true` in high-traffic channels to avoid noise. The bot will only
  respond when explicitly @mentioned.
- **`enabled: false`**: Use this to register a channel in the allowlist (so the bot is aware of
  it) without activating any skill routing. Useful for logging channels.
- **`roles` vs `users`**: The `roles` array accepts Discord role IDs. You can also use a `users`
  array of Discord user IDs for individual overrides.
- **Skill names**: Must exactly match the `metadata.name` field exported from the skill module.
  A mismatch will result in the skill being silently unavailable in that channel.
