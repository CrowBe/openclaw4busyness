# Infrastructure & Deployment Architecture

**Trade Business Automation Assistant**\
February 2026 | v1.0 | Living Document

---

## 1. Purpose & Scope

This document describes the infrastructure and deployment architecture for the
trade business automation assistant, a purpose-built fork of
[OpenClaw](https://github.com/openclaw/openclaw) hosted at
<https://github.com/CrowBe/openclaw4busyness>.

It covers the two-environment model (personal development and business
production), the GitHub-based deployment pipeline, the Discord server structure,
and operational procedures.

**Relationship to other documents:** The Build Plan covers application-layer
architecture and MVP scope. The Business Case covers cost and risk. This
document covers only infrastructure and operational concerns.

---

## 2. Environment Overview

Two fully isolated environments sharing no API keys, network pathways, or
devices.

> **Note:** The repository is **public / open-source**. Despite being publicly
> readable on GitHub, the deploy key model described below is still recommended
> because it scopes the business device to a single repository and avoids any
> credential leakage (no personal tokens stored on the production device).

| Attribute | Development | Production |
| --- | --- | --- |
| Device | Personal laptop / workstation | Dedicated business device (always-on mini PC) |
| GitHub access | Personal account with full repo access | Read-only SSH deploy key (production branch only) |
| Anthropic API key | Personal key | Business key |
| Discord permissions | Personal admin account | No admin permissions -- gateway acts as bot only |
| Codebase scope | Full access, skill authoring & testing | Runs gateway process only (permanent systemd service) |
| Data | No client/job data | All client/job data stored here only |
| Writes to | `main-internal` branch | Does not write to the repository |
| Runtime requirements | Node.js >= 22.12, pnpm 10.23 | Node.js >= 22.12, pnpm 10.23 |

---

## 3. GitHub Repository Structure

Repository URL: <https://github.com/CrowBe/openclaw4busyness>

### 3.1 Branch Model

Three persistent branches. Changes flow in one direction only.

```text
main-internal  -->  staging (optional)  -->  production
```

- **`main-internal`** -- primary development. All new work lands here.
- **`staging`** -- optional intermediate branch for integration testing.
- **`production`** -- only branch the business device reads. Protected branch:
  no force push, no direct commits.

### 3.2 Branch Protection Rules (production branch)

- Require pull request before merging.
- Restrict who can push -- developer account only.
- No force pushes, no deletions.
- Require linear history (recommended).

### 3.3 Deploy Key Configuration

The business device uses an SSH deploy key (`ed25519`) scoped to the
repository, **read-only**. Even though the repository is public, the deploy key
is recommended to avoid storing any personal access tokens on the production
device and to scope access exclusively to this repository.

**Generate the key:**

```bash
ssh-keygen -t ed25519 -C "business-device-deploy" -f ~/.ssh/deploy_key
```

**Configure the SSH alias** (`~/.ssh/config` on the business device):

```text
Host github-deploy
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
```

**Add the public key** to the GitHub repository under
Settings > Deploy keys (read-only checkbox enabled).

**Clone using the alias:**

```bash
git clone git@github-deploy:CrowBe/openclaw4busyness.git /opt/gateway
```

### 3.4 Upstream Remote (Development Only)

The upstream OpenClaw repository is configured as a remote on the dev machine
only:

```bash
git remote add upstream https://github.com/openclaw/openclaw.git
```

Cherry-pick selectively. Nothing is pulled automatically.

---

## 4. Deployment Pipeline

### 4.1 Overview

Fully automated via systemd timer. The developer merges to `production`; the
business device picks it up on the next scheduled run.

### 4.2 Deploy Script

Location: `/opt/gateway/deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/gateway"
LOG_FILE="/var/log/gateway-deploy.log"
BRANCH="production"

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" >> "$LOG_FILE"
}

cd "$DEPLOY_DIR" || { log "FATAL: cannot cd to $DEPLOY_DIR"; exit 1; }

# Fetch latest from remote
git fetch origin "$BRANCH" 2>>"$LOG_FILE"

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
  log "INFO: already up to date ($LOCAL_HASH)"
  exit 0
fi

log "INFO: deploying $LOCAL_HASH -> $REMOTE_HASH"

# Record last known good commit for rollback
echo "$LOCAL_HASH" > "$DEPLOY_DIR/.last-good-commit"

# Pull changes
git reset --hard "origin/$BRANCH" 2>>"$LOG_FILE"

# Install dependencies (pnpm, not npm)
pnpm install --prod 2>>"$LOG_FILE"

# Build the TypeScript project (required -- OpenClaw uses tsdown)
pnpm run build 2>>"$LOG_FILE"

# Restart the gateway service
sudo systemctl restart gateway.service 2>>"$LOG_FILE"

log "INFO: deploy complete ($REMOTE_HASH)"
```

> **Critical note:** OpenClaw uses **pnpm** (v10.23) as its package manager and
> requires a TypeScript build step via `tsdown`. The business device must have
> **Node.js >= 22.12** and **pnpm >= 10.23** installed. Do not use
> `npm install` -- it will not resolve the workspace correctly.

**Make the script executable:**

```bash
chmod +x /opt/gateway/deploy.sh
```

### 4.3 Systemd Units

**Service unit** (`/etc/systemd/system/gateway-deploy.service`):

```ini
[Unit]
Description=Gateway deploy check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/gateway/deploy.sh
User=gateway
Group=gateway
WorkingDirectory=/opt/gateway
```

**Timer unit** (`/etc/systemd/system/gateway-deploy.timer`):

```ini
[Unit]
Description=Nightly gateway deploy check

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
```

**Enable the timer:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gateway-deploy.timer
```

### 4.4 Developer Deployment Workflow

1. Develop and test on `main-internal`.
2. Open a PR from `main-internal` (or `staging`) to `production`.
3. Merge the PR.
4. Business device picks up the change overnight (or on next timer run).
5. Verify via deploy log (`/var/log/gateway-deploy.log`) or the `/status`
   Discord command.

### 4.5 Emergency Rollback

SSH into the business device and execute:

```bash
cd /opt/gateway

# Check last known good commit
cat .last-good-commit

# Roll back
git reset --hard <last-good-commit>
pnpm install --prod
pnpm run build
sudo systemctl restart gateway.service

# Verify
sudo systemctl status gateway.service
```

---

## 5. Discord Server Architecture

### 5.1 Server Design Principles

The Discord server is a **purpose-built operational tool**, not a social
community. Channel visibility is enforced at the Discord permission level. The
gateway bot validates the sender role in every message handler.

> **OpenClaw native support:** The OpenClaw Discord extension already provides
> per-channel configuration at the gateway level. These settings are defined in
> the gateway's JSON5 config file under:
>
> ```text
> channels.discord.guilds.<guild-id>.channels.<channel-id>
> ```
>
> Supported per-channel fields include:
>
> - **`skills`** -- array of skill names allowed in this channel (skill
>   filtering).
> - **`roles`** -- array of Discord role IDs whose members may trigger the bot
>   in this channel.
> - **`users`** -- array of Discord user IDs allowed to trigger the bot.
> - **`systemPrompt`** -- per-channel system prompt injected into every
>   conversation in that channel.
> - **`requireMention`** -- whether the bot requires an @mention to respond.
> - **`allow`** -- boolean to explicitly allow or deny the channel.
> - **`autoThread`** -- automatically create a thread for each conversation.
>
> This means access control and skill scoping are enforced at **two layers**:
> Discord-native permissions (channel visibility) and OpenClaw config-level
> gating (skill filtering, role checks, system prompts). Both layers should be
> configured to match.

### 5.2 Role Structure

| Role | Assigned To | Access | Capabilities |
| --- | --- | --- | --- |
| **Admin** | Developer personal account | Full server management, all channels | All skills + system commands |
| **Office Operator** | Office staff | Operator channels only | Quote/inquiry/HITL/summary skills |
| **Field Worker** | On-site staff | `#job-reports` and `#timesheets` only | Voice/text notes and reports |

### 5.3 Channel Structure

| Channel | Minimum Role | Purpose |
| --- | --- | --- |
| `#job-reports` | Field Worker | Voice notes, text notes, field reports |
| `#timesheets` | Field Worker | Daily timesheet submissions |
| `#operations` | Office Operator | Daily workflow |
| `#approvals` | Office Operator | Dedicated HITL approval queue |
| `#content` | Office Operator | Content ideation (post-MVP) |
| `#admin-only` | Admin | System status, deploy log, audit log |
| `#bot-log` | Admin | Gateway event log (append-only) |

### 5.4 Server Setup Procedure

**Step 1 -- Create Server:**

1. Create a new Discord server (community template or blank).
2. Name it according to the business (e.g. "TradeOps").
3. Disable default channels except `#general` (will be repurposed or deleted).

**Step 2 -- Create Roles:**

1. Open Server Settings > Roles.
2. Create the three roles listed in section 5.2 (`Admin`, `Office Operator`,
   `Field Worker`).
3. For each role, disable "Display role members separately" unless desired.
4. Assign the developer personal account to `Admin`.

**Step 3 -- Create Channels:**

1. Create each channel listed in section 5.3.
2. For each channel, configure permission overrides:
   - Deny `@everyone` from viewing the channel.
   - Grant the minimum role (and above) view + send permissions.
3. For `#bot-log`, grant the bot role send-message permission only (no human
   writes).

**Step 4 -- Register Gateway Bot:**

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application, then create a Bot under the application.
3. Enable the **Message Content** privileged gateway intent (Bot > Privileged
   Gateway Intents).
4. Copy the bot token into the `.env` file on the business device (see
   section 7).
5. Generate an invite URL with the required permissions:
   - Read Messages / View Channels
   - Send Messages
   - Send Messages in Threads
   - Embed Links
   - Attach Files
   - Read Message History
   - Add Reactions
   - Use Slash Commands
6. Invite the bot to the server using the generated URL.

### 5.5 Gateway Channel Configuration

After the Discord server is set up, configure the OpenClaw gateway config
(JSON5) to enforce per-channel access at the application layer. Example:

```json5
{
  channels: {
    discord: {
      groupPolicy: "allowlist",
      guilds: {
        "<guild-id>": {
          requireMention: false,
          channels: {
            "<job-reports-channel-id>": {
              allow: true,
              roles: ["<field-worker-role-id>", "<office-operator-role-id>", "<admin-role-id>"],
              skills: ["job-report", "timesheet"],
              systemPrompt: "You are a field operations assistant. Help workers submit job reports and time entries.",
            },
            "<operations-channel-id>": {
              allow: true,
              roles: ["<office-operator-role-id>", "<admin-role-id>"],
              skills: ["quote", "inquiry", "summary", "schedule"],
              systemPrompt: "You are an office operations assistant. Help with quotes, inquiries, and daily scheduling.",
            },
            "<approvals-channel-id>": {
              allow: true,
              roles: ["<office-operator-role-id>", "<admin-role-id>"],
              skills: ["approve", "reject", "escalate"],
              systemPrompt: "You are the approval queue handler. Present items for review and process approvals.",
            },
            "<admin-only-channel-id>": {
              allow: true,
              roles: ["<admin-role-id>"],
              skills: ["status", "deploy", "audit"],
              systemPrompt: "You are the system administration assistant.",
            },
          },
        },
      },
    },
  },
}
```

---

## 6. Maintenance Access

### 6.1 Principles

Direct access to the business device is reserved for the developer and treated
as a maintenance window. All routine operations should flow through the
automated deploy pipeline or Discord commands.

### 6.2 SSH Access Configuration

Restrict SSH to the developer machine IP only, or use a WireGuard VPN.

**`/etc/ssh/sshd_config` hardening:**

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers gateway
```

If using IP restriction:

```text
# /etc/ssh/sshd_config.d/restrict.conf
Match User gateway
  AllowTcpForwarding no
```

Combined with a firewall rule:

```bash
sudo ufw allow from <developer-ip> to any port 22
sudo ufw deny 22
```

### 6.3 What Constitutes a Maintenance Window

- Initial device setup and provisioning.
- Rotating API keys or Discord bot token.
- Investigating deploy failures.
- Manual log inspection.
- OS security updates.
- Database migrations that cannot be automated.

### 6.4 System Updates (OS Level)

Use `unattended-upgrades` for security patches only. Automatic reboot is
disabled.

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

In `/etc/apt/apt.conf.d/50unattended-upgrades`:

```text
Unattended-Upgrade::Automatic-Reboot "false";
```

---

## 7. Secrets & Configuration Management

### 7.1 Secrets Inventory

| Secret | Location | Notes |
| --- | --- | --- |
| Business Anthropic API key | `.env` on business device only | Never committed to the repository |
| Discord bot token | `.env` on business device only | Never committed to the repository |
| Business device SSH private key | Developer personal machine only | Used for maintenance access |
| GitHub deploy key (private) | Business device `~/.ssh/` only | Read-only, repository-scoped |

### 7.2 The `.env` File

Location: `/opt/gateway/.env`

```bash
# /opt/gateway/.env
ANTHROPIC_API_KEY=sk-ant-...
DISCORD_BOT_TOKEN=...
```

Ownership and permissions:

```bash
sudo chown gateway:gateway /opt/gateway/.env
sudo chmod 600 /opt/gateway/.env
```

The `.env` file is listed in `.gitignore` and must never be committed.

**Key rotation schedule:** Rotate all keys every 6 months minimum, or
immediately if a compromise is suspected.

---

## 8. Backup & Recovery

### 8.1 What Needs Backing Up

| Item | Location | Priority |
| --- | --- | --- |
| Gateway database (SQLite) | `/opt/gateway/data/` | Critical |
| `.env` file | `/opt/gateway/.env` | Critical (encrypted) |
| Gateway config (if customised) | `/opt/gateway/config/` | Important |

### 8.2 Backup Procedure

Nightly backup via systemd timer. The archive is GPG-encrypted and uploaded to
Backblaze B2.

**Backup script** (`/opt/gateway/backup.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/tmp/gateway-backup"
TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
ARCHIVE="/tmp/gateway-backup-${TIMESTAMP}.tar.gz.gpg"
B2_BUCKET="your-b2-bucket-name"

mkdir -p "$BACKUP_DIR"

# Copy files to backup staging
cp /opt/gateway/data/*.sqlite "$BACKUP_DIR/" 2>/dev/null || true
cp /opt/gateway/.env "$BACKUP_DIR/"
cp -r /opt/gateway/config/ "$BACKUP_DIR/config/" 2>/dev/null || true

# Create encrypted archive
tar czf - -C "$BACKUP_DIR" . | gpg --batch --yes --symmetric \
  --cipher-algo AES256 --passphrase-file /opt/gateway/.backup-passphrase \
  -o "$ARCHIVE"

# Upload to B2
b2 upload-file "$B2_BUCKET" "$ARCHIVE" "backups/gateway-backup-${TIMESTAMP}.tar.gz.gpg"

# Cleanup
rm -rf "$BACKUP_DIR" "$ARCHIVE"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] backup complete" >> /var/log/gateway-backup.log
```

**Systemd timer** (`/etc/systemd/system/gateway-backup.timer`):

```ini
[Unit]
Description=Nightly gateway backup

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
```

### 8.3 Recovery Procedure

1. Provision a replacement device (mini PC, same OS).
2. Configure SSH access and deploy key (section 3.3).
3. Clone the `production` branch:

   ```bash
   git clone --branch production git@github-deploy:CrowBe/openclaw4busyness.git /opt/gateway
   ```

4. Restore `.env` and database from the encrypted backup:

   ```bash
   gpg --batch --passphrase-file /path/to/passphrase \
     -d gateway-backup-TIMESTAMP.tar.gz.gpg | tar xzf - -C /opt/gateway/
   ```

5. Install dependencies and build:

   ```bash
   cd /opt/gateway
   pnpm install --prod
   pnpm run build
   ```

6. Create and start the gateway service:

   ```bash
   sudo systemctl enable --now gateway.service
   ```

7. Verify with the `/status` Discord command or check logs.

**Recovery time objective:** Under 2 hours.

---

## 9. Gateway Systemd Service

The gateway itself runs as a permanent systemd service.

**Service unit** (`/etc/systemd/system/gateway.service`):

```ini
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/gateway/dist/index.js gateway
WorkingDirectory=/opt/gateway
User=gateway
Group=gateway
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/gateway/.env

# Hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/opt/gateway/data /var/log
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gateway.service
```

---

## 10. Configuration Reference

All values are left blank intentionally. Fill in during initial provisioning.

| Key | Value | Notes |
| --- | --- | --- |
| Business device hostname | | |
| Business device LAN IP | | |
| Developer SSH public key fingerprint | | |
| Deploy key fingerprint | | |
| GitHub repository URL | `https://github.com/CrowBe/openclaw4busyness` | Public repository |
| Production branch | `production` | |
| Discord server ID (guild ID) | | |
| Discord bot application ID | | |
| `#job-reports` channel ID | | |
| `#timesheets` channel ID | | |
| `#operations` channel ID | | |
| `#approvals` channel ID | | |
| `#content` channel ID | | |
| `#admin-only` channel ID | | |
| `#bot-log` channel ID | | |
| Admin role ID | | |
| Office Operator role ID | | |
| Field Worker role ID | | |
| Backblaze B2 bucket name | | |
| Backup GPG passphrase location | `/opt/gateway/.backup-passphrase` | |
| Node.js version | >= 22.12 | Required by OpenClaw |
| pnpm version | >= 10.23 | Required by OpenClaw |
| Deploy timer schedule | 02:30 UTC (+ up to 10 min jitter) | |
| Backup timer schedule | 03:00 UTC (+ up to 5 min jitter) | |
| Key rotation interval | 6 months minimum | |
