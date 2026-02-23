# Discord Server Setup Checklist

This checklist walks through setting up the Discord server for the trade business automation
assistant from scratch. Work through each section in order. Checkboxes are provided so you can
track your progress.

If you are not familiar with the Discord Developer Portal, take your time — the steps include
enough detail to follow without prior experience.

---

## Part 1: Create the Discord Application and Bot

- [ ] Go to <https://discord.com/developers/applications> and sign in with your Discord account.
- [ ] Click **New Application** (top-right corner).
- [ ] Enter a name for the application (e.g. `TradeAssistant`) and click **Create**.
- [ ] On the left sidebar, click **Bot**.
- [ ] Click **Add Bot** (or **Reset Token** if a bot already exists). Confirm when prompted.
- [ ] Under the bot's username, click **Reset Token** and copy the token that appears.
  - Store this token securely (e.g. in a password manager or `.env` file). You will not be able
    to view it again after leaving the page.
  - **Never share this token publicly** — anyone with the token can control the bot.
- [ ] Set a profile picture for the bot (optional but recommended) by clicking the avatar icon.

---

## Part 2: Configure Required Bot Permissions and Intents

Discord requires you to explicitly enable certain capabilities (called "Privileged Gateway Intents")
before the bot can read message content or see server members.

- [ ] On the **Bot** page, scroll down to **Privileged Gateway Intents**.
- [ ] Enable **Server Members Intent** (required to read member role information).
- [ ] Enable **Message Content Intent** (required to read the text of messages).
- [ ] Click **Save Changes**.

### OAuth2 Permissions

- [ ] On the left sidebar, click **OAuth2**, then **URL Generator**.
- [ ] Under **Scopes**, check:
  - `bot`
  - `applications.commands` (if you plan to use slash commands in future)
- [ ] Under **Bot Permissions**, check the following:
  - **Read Messages / View Channels**
  - **Send Messages**
  - **Send Messages in Threads**
  - **Create Public Threads** (if using the auto-thread feature)
  - **Manage Messages** (needed to add/remove reaction acknowledgements)
  - **Add Reactions**
  - **Read Message History**
  - **Attach Files** (if the bot needs to send file attachments)
  - **Use External Emojis** (needed for custom reaction emojis)
- [ ] Copy the generated URL at the bottom of the page. You will use it in Part 3.

---

## Part 3: Invite the Bot to the Server

- [ ] Open the invite URL you copied in the previous step in your browser.
- [ ] Select your trade business Discord server from the dropdown.
- [ ] Review the permissions list and click **Authorize**.
- [ ] Complete any CAPTCHA if prompted.
- [ ] The bot should now appear in your server's member list (likely shown as offline until started).

---

## Part 4: Create Roles

You need three roles to control who can interact with the bot in each channel.

- [ ] Open your Discord server.
- [ ] Click the server name at the top-left and choose **Server Settings**.
- [ ] Click **Roles** on the left sidebar.

### Create the Admin role

- [ ] Click **Create Role**.
- [ ] Name it `Admin`.
- [ ] Assign a colour if desired (e.g. red).
- [ ] Under **Permissions**, enable **Administrator** (or configure specific permissions manually).
- [ ] Click **Save Changes**.
- [ ] Right-click the `Admin` role in the list, click **Copy Role ID**, and paste it somewhere safe.
  - (Developer Mode must be enabled: User Settings > Advanced > Developer Mode)

### Create the Office Operator role

- [ ] Click **Create Role**.
- [ ] Name it `Office Operator`.
- [ ] Assign a colour if desired (e.g. blue).
- [ ] Do not enable Administrator. Leave default member permissions.
- [ ] Click **Save Changes**.
- [ ] Right-click the role and copy its ID.

### Create the Field Worker role

- [ ] Click **Create Role**.
- [ ] Name it `Field Worker`.
- [ ] Assign a colour if desired (e.g. green).
- [ ] Do not enable Administrator. Leave default member permissions.
- [ ] Click **Save Changes**.
- [ ] Right-click the role and copy its ID.

### Assign roles to members

- [ ] Click **Members** on the left sidebar in Server Settings (or right-click a member in the
      server and choose **Roles**).
- [ ] Assign the `Admin` role to yourself and any other administrators.
- [ ] Assign `Office Operator` to office staff.
- [ ] Assign `Field Worker` to field workers.

---

## Part 5: Create Channels with Permission Overrides

By default, all members can see all channels. You need to restrict visibility so each channel is
only accessible to the appropriate roles.

### General approach for each channel

1. Click the **+** icon next to **Text Channels** in the sidebar.
2. Name the channel (use the exact names below).
3. After creating it, right-click the channel > **Edit Channel** > **Permissions**.
4. Click the **+** icon under **Roles/Members**, add the relevant roles, and configure:
   - **View Channel**: allow for permitted roles, deny for `@everyone`.
   - **Send Messages**: allow for permitted roles, deny for `@everyone`.
5. For `@everyone`, set **View Channel** to deny (to make the channel private by default).

### Channel setup

- [ ] **#job-reports**
  - Permitted roles: `Field Worker`, `Office Operator`, `Admin`
  - `@everyone`: View Channel = Deny
  - `Field Worker`: View Channel = Allow, Send Messages = Allow
  - `Office Operator`: View Channel = Allow, Send Messages = Allow
  - `Admin`: View Channel = Allow, Send Messages = Allow
  - Right-click the channel after creation, click **Copy Channel ID**, and save it.

- [ ] **#timesheets**
  - Permitted roles: `Field Worker`, `Office Operator`, `Admin`
  - Apply the same permission pattern as `#job-reports`.
  - Right-click and copy the channel ID.

- [ ] **#operations**
  - Permitted roles: `Office Operator`, `Admin`
  - `@everyone`: View Channel = Deny
  - `Office Operator`: View Channel = Allow, Send Messages = Allow
  - `Admin`: View Channel = Allow, Send Messages = Allow
  - Right-click and copy the channel ID.

- [ ] **#approvals**
  - Permitted roles: `Office Operator`, `Admin`
  - Apply the same permission pattern as `#operations`.
  - Right-click and copy the channel ID.

- [ ] **#content**
  - Permitted roles: `Office Operator`, `Admin`
  - Apply the same permission pattern as `#operations`.
  - Right-click and copy the channel ID.

- [ ] **#admin-only**
  - Permitted roles: `Admin` only
  - `@everyone`: View Channel = Deny
  - `Admin`: View Channel = Allow, Send Messages = Allow
  - Right-click and copy the channel ID.

- [ ] **#bot-log**
  - Permitted roles: `Admin` only (read-only for all humans)
  - `@everyone`: View Channel = Deny, Send Messages = Deny
  - `Admin`: View Channel = Allow, Send Messages = Deny (admins can read but not post here)
  - Right-click and copy the channel ID.

---

## Part 6: Gateway Config Setup

Now you will add your server's IDs to the OpenClaw configuration file.

- [ ] Open `DISCORD_CONFIG_TEMPLATE.md` (in this same `docs/internal/` directory) and read
      through the full template before making changes.
- [ ] Open your OpenClaw config file (e.g. `config.json5` in the project root or the path set
      by your deployment).
- [ ] Locate or create the `channels.discord.guilds` section.
- [ ] Copy your **Guild ID** (right-click the server icon in Discord > Copy Server ID) and
      replace `GUILD_ID_HERE` in the config.
- [ ] Replace each channel placeholder (`JOB_REPORTS_CHANNEL_ID`, etc.) with the actual channel
      IDs you copied in Part 5.
- [ ] Replace each role placeholder (`FIELD_WORKER_ROLE_ID`, `OPERATOR_ROLE_ID`, `ADMIN_ROLE_ID`)
      with the actual role IDs you copied in Part 4.
- [ ] Review the `skills:` arrays for each channel. Ensure the skill name strings match the
      `metadata.name` values exported by the skill modules you have installed.
- [ ] For channels where the bot should be silent at MVP (`#timesheets`, `#content`, `#bot-log`),
      confirm `enabled: false` is set.
- [ ] Save the config file.

---

## Part 7: Bot Token Configuration

- [ ] Locate your `.env` file or environment variable configuration for the OpenClaw deployment.
- [ ] Set the Discord bot token environment variable to the token you copied in Part 1:
  ```
  DISCORD_TOKEN=your-bot-token-here
  ```
  (The exact variable name may differ depending on your deployment — check the OpenClaw docs or
  your existing `.env.example` file for the correct key name.)
- [ ] Ensure the `.env` file is **not** committed to version control. Confirm it is listed in
      `.gitignore`.
- [ ] If deploying to a server (VPS, container, etc.), add the token as an environment variable
      in your hosting platform's settings rather than in a file.

---

## Part 8: Testing the Setup

Run through these checks after starting the bot for the first time.

### Bot presence

- [ ] Start the bot using the appropriate command for your deployment (e.g. `npm start` or
      your process manager).
- [ ] Confirm the bot appears as **online** in the Discord server's member list.

### Channel access

- [ ] Log in to Discord as a user with the `Field Worker` role.
  - Confirm you can see `#job-reports` and `#timesheets`.
  - Confirm you cannot see `#operations`, `#approvals`, `#content`, `#admin-only`, or `#bot-log`.
- [ ] Log in as a user with the `Office Operator` role.
  - Confirm you can see `#job-reports`, `#timesheets`, `#operations`, `#approvals`, `#content`.
  - Confirm you cannot see `#admin-only` or `#bot-log`.
- [ ] Log in as a user with the `Admin` role.
  - Confirm you can see all channels.

### Bot responses

- [ ] In `#job-reports`, @mention the bot and send a short test message (e.g. `@TradeAssistant hello`).
  - Confirm the bot responds.
  - Confirm the `voice-note` and `field-report` skills are available (the bot should not report
    that these skills are missing or unavailable).
- [ ] In `#operations`, @mention the bot and test `quote-draft` and `inquiry-triage`.
- [ ] In `#approvals`, test `hitl-approve`.
- [ ] In `#admin-only`, @mention the bot and test `audit-log`.
- [ ] In `#timesheets` and `#content`, @mention the bot and confirm it does **not** respond
      (because `enabled: false`).
- [ ] In `#bot-log`, confirm the bot is writing log entries and that no human messages trigger a
      bot response.

### Role gating

- [ ] Send a message in `#operations` as a `Field Worker` user. Confirm the bot does not respond
      (Field Worker is not in the roles list for that channel).
- [ ] Send a message in `#admin-only` as an `Office Operator` user. Confirm the bot does not
      respond.

### DM pairing (if dmPolicy is "pairing")

- [ ] From an account that is not in the `allowFrom` list, send a direct message to the bot.
  - Confirm the bot replies with a pairing code rather than processing the message.

---

## Troubleshooting

| Symptom                                          | Likely cause                                  | Resolution                                          |
| ------------------------------------------------ | --------------------------------------------- | --------------------------------------------------- |
| Bot is offline after starting                    | Token is wrong or missing                     | Re-check the `DISCORD_TOKEN` env var                |
| Bot does not respond in a channel                | `enabled: false` or role not in `roles:` list | Check config for that channel ID                    |
| Bot responds to everyone, not just allowed roles | `roles:` list missing or wrong IDs            | Verify role IDs in the config                       |
| Skill not triggering                             | Skill name mismatch                           | Check `metadata.name` in the skill module           |
| Bot cannot read messages                         | Message Content Intent not enabled            | Developer Portal > Bot > Privileged Gateway Intents |
| Cannot copy IDs                                  | Developer Mode is off                         | User Settings > Advanced > Developer Mode           |
