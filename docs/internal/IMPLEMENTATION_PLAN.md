# Implementation Plan

**Trade Business Automation Assistant -- MVP**\
Derived from BUILD_PLAN.md and INFRASTRUCTURE.md | February 2026

---

## 1. How to Read This Document

This plan translates the architectural goals in BUILD_PLAN.md into concrete,
file-level implementation tasks. Each task references the existing OpenClaw
codebase patterns it should follow. Tasks are ordered by dependency -- later
tasks assume earlier ones are complete.

The four build phases from the build plan are preserved. Within each phase,
tasks are numbered sequentially. Each task includes:

- **What** -- the deliverable.
- **Where** -- the files to create or modify (paths relative to repo root).
- **How** -- implementation approach referencing existing patterns.
- **Tests** -- what to test and where the test file lives.
- **Acceptance** -- the verifiable outcome.

---

## 2. Phase 1: Repository and Infrastructure (Weeks 1--2)

### Task 1.1: Remove ClawHub Skill Registry

**What:** Remove the ClawHub remote skill registry module and all dynamic
skill-installation endpoints. Skills may only be loaded from the local
`/skills` directory at gateway startup.

**Where:**

- `src/gateway/server-methods/skills.ts` -- remove `skills.install` handler.
- `src/infra/skills-remote.ts` -- remove or stub out entirely.
- `src/agents/skills-install.ts` -- remove.
- `src/agents/skills.js` -- audit; keep local loading, remove any remote
  fetching.
- `src/gateway/protocol/` -- remove `validateSkillsInstallParams` schema.
- `CHANGELOG.md` -- document removal as the first fork-specific commit.
- `SECURITY.md` -- create; document the closed-skill policy.

**How:** The existing `skills.install` handler in
`src/gateway/server-methods/skills.ts:114-145` calls `installSkill()` from
`src/agents/skills-install.ts`. Remove the handler entry and delete the
install module. The `skills.status`, `skills.bins`, and `skills.update`
handlers remain -- they operate on local workspace entries only.

**Tests:** Verify that the gateway starts without the install handler and that
attempting a `skills.install` WebSocket call returns an error. Add a unit test
in `src/gateway/server-methods/skills.test.ts` (or extend the existing
`server-methods.test.ts`) confirming the method is not registered.

**Acceptance:** `pnpm build && pnpm check && pnpm test` passes. No
`skills.install` method is reachable. `CHANGELOG.md` and `SECURITY.md` exist.

---

### Task 1.2: Remove Moltbook/Social Agent Integration

**What:** Remove modules related to social agent integrations that are not
relevant to the trade business use case.

**Where:**

- Identify and remove any Moltbook-related imports or modules (search for
  `moltbook`, `social-agent`, or similar terms in `src/`).
- Remove dead code paths that reference removed modules.

**How:** Grep the codebase for references. Remove imports and modules. Run the
build to confirm no broken references remain.

**Tests:** `pnpm build && pnpm check && pnpm test` passes.

**Acceptance:** No references to removed social integrations remain in the
built output.

---

### Task 1.3: HITL Approval Queue -- Database Schema

**What:** Create the `pending_actions` SQLite table and data access layer for
the Human-in-the-Loop approval queue.

**Where:**

- `src/hitl/schema.ts` -- new file. Table definition and migrations.
- `src/hitl/store.ts` -- new file. CRUD operations for pending actions.
- `src/hitl/types.ts` -- new file. TypeScript types for the HITL system.

**How:** Follow the pattern used by the memory subsystem
(`src/memory/manager.ts`) which uses `better-sqlite3` for local SQLite
storage. The `pending_actions` table schema:

```sql
CREATE TABLE IF NOT EXISTS pending_actions (
  id            TEXT PRIMARY KEY,
  skill_name    TEXT NOT NULL,
  action_type   TEXT NOT NULL,        -- 'financial' | 'client_facing' | 'system_modify'
  proposed_data TEXT NOT NULL,        -- JSON blob of the proposed action
  requested_by  TEXT NOT NULL,        -- Discord user ID
  requested_at  TEXT NOT NULL,        -- ISO timestamp
  expires_at    TEXT NOT NULL,        -- ISO timestamp
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected' | 'expired'
  decided_by    TEXT,                 -- Discord user ID of approver
  decided_at    TEXT,                 -- ISO timestamp
  reject_reason TEXT,                 -- Optional reason for rejection
  session_key   TEXT,                 -- Gateway session key for context
  channel_id    TEXT                  -- Discord channel where action was requested
);
```

Also follow the `ExecApprovalManager` pattern
(`src/gateway/exec-approval-manager.ts`) for the in-memory pending/resolve
lifecycle with promise-based waiting.

**Tests:** `src/hitl/store.test.ts` -- unit tests for CRUD operations, expiry
logic, and status transitions using an in-memory SQLite database.

**Acceptance:** Store can create, read, update (accept/reject/expire), and
list pending actions. Expired actions are automatically marked on query.

---

### Task 1.4: HITL Approval Queue -- Gateway Integration

**What:** Register HITL approval methods in the gateway WebSocket protocol,
following the `GatewayRequestHandlers` pattern.

**Where:**

- `src/hitl/gateway-handlers.ts` -- new file. Gateway method handlers.
- `src/gateway/server-methods-list.ts` -- add HITL handlers to the method
  registry.
- `src/gateway/protocol/schema/` -- add validation schemas for HITL params.

**How:** Follow the exact pattern from
`src/gateway/server-methods/exec-approvals.ts`:

- `hitl.pending.list` -- list pending actions (with optional filters).
- `hitl.pending.get` -- get a single pending action by ID.
- `hitl.action.accept` -- accept a pending action (requires role check).
- `hitl.action.reject` -- reject a pending action with optional reason.

Use snapshot-based state with hash-guarded updates, as demonstrated by
`requireApprovalsBaseHash()` in exec-approvals.

**Tests:** `src/hitl/gateway-handlers.test.ts` -- unit tests for each handler.

**Acceptance:** HITL methods are registered and callable via the WebSocket
protocol. Accept/reject flows update the `pending_actions` store correctly.

---

### Task 1.5: HITL Middleware -- Skill Execution Gate

**What:** Create gateway middleware that intercepts skill executions flagged as
`financial: true` or `client_facing: true` and routes them through the HITL
approval queue instead of executing immediately.

**Where:**

- `src/hitl/middleware.ts` -- new file. Middleware that checks skill metadata
  before execution.
- `src/hitl/skill-metadata.ts` -- new file. Skill metadata type definitions
  and validation.

**How:** The middleware inspects the skill's exported metadata. If `financial`
or `client_facing` is `true`, the middleware:

1. Writes a proposed action to the `pending_actions` table.
2. Sends a Discord message to the `#approvals` channel with action summary
   and Accept/Reject buttons (using the existing Discord components system
   at `src/discord/components.ts` and `src/discord/components-registry.ts`).
3. Returns a "pending approval" response to the caller.
4. On accept, executes the skill and returns the result.
5. On reject, logs the rejection and returns a rejection response.

**Design rule enforcement:** No skill with `financial: true` or
`client_facing: true` may bypass this middleware. Enforced at the gateway
layer, not at the skill level.

**Tests:** `src/hitl/middleware.test.ts` -- unit tests covering:

- Financial skill is routed through HITL.
- Client-facing skill is routed through HITL.
- Read-only skill bypasses HITL.
- Skill without metadata fails to load (startup validation).

**Acceptance:** A skill marked `financial: true` cannot execute without
explicit operator approval via Discord.

---

### Task 1.6: Add SenderRoles to MsgContext

**What:** Forward Discord member role IDs into `MsgContext` so that
downstream skill execution and HITL logic can make role-based decisions.

**Where:**

- `src/auto-reply/templating.ts` -- add `SenderRoles?: string[]` to the
  `MsgContext` type (around line 108, near `SenderName`).
- `src/discord/monitor/message-handler.process.ts` -- populate
  `SenderRoles` from the Discord member data during message processing.

**How:** The build plan identifies this as the one code change needed for
role-scoped permissions. The `DiscordMessagePreflightContext` already has
access to `guildInfo` which contains role information. The
`resolveAgentRoute()` function in `src/routing/resolve-route.ts` already
accepts `memberRoleIds` (line 35). The gap is that these role IDs are not
carried forward into `MsgContext` for use by skills.

Add the field to `MsgContext` and populate it in the Discord message handler
where the member data is available (the `message.member.roles` array from
the Discord API).

**Tests:** Add a test in `src/discord/monitor/message-handler.process.test.ts`
verifying that `SenderRoles` is populated from member data.

**Acceptance:** `MsgContext.SenderRoles` contains the Discord role IDs of the
message sender when processing Discord guild messages.

---

### Task 1.7: Role-Scoped Channel Configuration

**What:** Configure the gateway's JSON5 config to enforce the role/channel
matrix from the build plan using OpenClaw's native per-channel configuration.

**Where:**

- `config/` or project root config file -- the gateway JSON5 config.
- `docs/internal/DISCORD_CONFIG_TEMPLATE.md` -- new file documenting the
  template config with placeholder IDs.

**How:** OpenClaw already supports per-channel configuration via
`channels.discord.guilds.<guild-id>.channels.<channel-id>` with `roles`,
`skills`, `systemPrompt`, `requireMention`, and `allow` fields
(see `src/discord/monitor/allow-list.ts:26-39` for the
`DiscordGuildEntryResolved` type).

Create a config template matching the channel structure from
INFRASTRUCTURE.md Sections 5.3 and 5.5:

| Channel        | Roles                                | Skills (MVP)                     | Post-MVP only           |
| -------------- | ------------------------------------ | -------------------------------- | ----------------------- |
| `#job-reports` | Field Worker, Office Operator, Admin | `voice-note`, `field-report`     |                         |
| `#timesheets`  | Field Worker, Office Operator, Admin | _(no bot interaction at MVP)_    | `timesheet`             |
| `#operations`  | Office Operator, Admin               | `quote-draft`, `inquiry-triage`  | `summary`, `schedule`   |
| `#approvals`   | Office Operator, Admin               | `hitl-approve`                   |                         |
| `#content`     | Office Operator, Admin               | _(no bot interaction at MVP)_    | content pipeline skills |
| `#admin-only`  | Admin                                | `audit-log`                      | `status`, `deploy`      |
| `#bot-log`     | Admin                                | (logging output only, no skills) |                         |

Skill names in the config must exactly match the `metadata.name` field
exported by each skill module (e.g. `voice-note` maps to the `name`
field in `skills/voice-note.ts`). Post-MVP channels and skills should
be included in the config template as commented-out placeholders so the
Discord server structure is forward-compatible.

Each channel gets a `systemPrompt` tailored to its purpose.

**Tests:** Validate the config loads without errors. Write a config validation
test in `src/discord/monitor/allow-list.test.ts` or a new
`src/config/trade-config.test.ts` that parses the template and confirms all
channel entries resolve correctly.

**Acceptance:** Config template is documented and validated. Channel/role
matrix matches the build plan.

---

### Task 1.8: Discord Server Setup Documentation

**What:** Create a step-by-step Discord server setup checklist that references
INFRASTRUCTURE.md Section 5.4 and integrates with the gateway config template
from Task 1.7.

**Where:**

- `docs/internal/DISCORD_SETUP_CHECKLIST.md` -- new file.

**How:** Condense INFRASTRUCTURE.md Sections 5.1--5.5 into an actionable
checklist with checkboxes. Include the bot registration steps, role creation,
channel creation with permission overrides, and the gateway config mapping.

**Acceptance:** A non-technical operator can follow the checklist to set up
the Discord server from scratch.

---

### Task 1.9: Production Device Provisioning

**What:** Provision the business device with the gateway service, automated
deploy pipeline, nightly backup, and SSH hardening as specified in
INFRASTRUCTURE.md Sections 4, 6, 7, 8, and 9. This task does not modify
repository code -- it configures the production environment so the gateway
can run reliably as a managed service.

**Where:**

- `/opt/gateway/deploy.sh` -- deploy script (INFRASTRUCTURE.md Section 4.2).
  Verbatim copy from that section; make executable (`chmod +x`).
- `/etc/systemd/system/gateway.service` -- permanent gateway process unit
  (Section 9).
- `/etc/systemd/system/gateway-deploy.service` -- one-shot deploy service
  unit (Section 4.3).
- `/etc/systemd/system/gateway-deploy.timer` -- nightly deploy trigger
  (Section 4.3). Runs at 02:30 UTC with 10-minute jitter.
- `/opt/gateway/backup.sh` -- GPG-encrypted nightly backup script
  (Section 8.2). Uploads to Backblaze B2.
- `/etc/systemd/system/gateway-backup.timer` -- nightly backup trigger
  (Section 8.2). Runs at 03:00 UTC with 5-minute jitter.
- `/etc/ssh/sshd_config` -- SSH hardening: key-only auth, no root login,
  restricted `AllowUsers` (Section 6.2).
- `/opt/gateway/.env` -- secrets file containing `ANTHROPIC_API_KEY` and
  `DISCORD_BOT_TOKEN`. Permissions must be `600`, owned by the `gateway`
  user (Section 7.2).
- `docs/internal/CONFIGURATION_REFERENCE.md` -- new file. A filled-in copy
  of INFRASTRUCTURE.md Section 10 with the actual device hostname, IP,
  fingerprints, channel IDs, role IDs, and Backblaze bucket name captured
  after provisioning.

**How:** Follow INFRASTRUCTURE.md step-by-step:

1. Create the `gateway` OS user (`useradd --system --create-home gateway`).
2. Clone the `production` branch to `/opt/gateway` using the read-only SSH
   deploy key (Section 3.3).
3. Copy the `deploy.sh` script from INFRASTRUCTURE.md Section 4.2, install
   the systemd units from Sections 4.3 and 9, enable and start them.
4. Copy `backup.sh` from Section 8.2, configure the Backblaze B2 bucket,
   write the GPG passphrase to `/opt/gateway/.backup-passphrase` (mode
   `400`), install and enable the backup timer.
5. Apply SSH hardening from Section 6.2 and confirm key-only login works
   before closing the session.
6. Create `/opt/gateway/.env` with the business API keys; set permissions
   to `600`.
7. Perform an initial manual deploy run (`bash /opt/gateway/deploy.sh`) and
   verify the gateway service starts cleanly.

**Tests:** Manual verification checklist:

- `sudo systemctl is-active gateway.service` returns `active`.
- `sudo systemctl is-active gateway-deploy.timer` returns `active`.
- `sudo systemctl is-active gateway-backup.timer` returns `active`.
- Run `deploy.sh` manually and confirm it exits 0 and the gateway restarts.
- Run `backup.sh` manually and confirm a `.tar.gz.gpg` object appears in
  the B2 bucket.
- Confirm password SSH login is rejected; key-based login succeeds.
- Verify `/opt/gateway/.env` is mode `600` owned by `gateway`.

**Acceptance:** Gateway service starts automatically on boot, restarts on
failure. Deploy pipeline picks up `production` branch changes overnight.
Nightly encrypted backups land in Backblaze B2. SSH access is key-only and
restricted to the developer's machine. All items in INFRASTRUCTURE.md
Section 10 are filled in and committed to
`docs/internal/CONFIGURATION_REFERENCE.md`.

---

## 3. Phase 2: Core Skill Framework (Weeks 3--4)

### Task 2.1: Closed Skill Registry -- Skill Loader

**What:** Implement a skill loader that reads TypeScript skill modules from a
`/skills` directory at gateway startup. Each skill must export a standard
metadata object.

**Where:**

- `src/skills/` -- new directory.
- `src/skills/loader.ts` -- skill loading and validation logic.
- `src/skills/types.ts` -- skill metadata type and skill interface.
- `src/skills/registry.ts` -- in-memory registry of loaded skills.

**How:** Define the skill metadata type:

```typescript
export type SkillMetadata = {
  name: string;
  description: string;
  financial: boolean;
  client_facing: boolean;
  read_only: boolean;
};

export type Skill = {
  metadata: SkillMetadata;
  execute: (context: SkillExecutionContext) => Promise<SkillResult>;
};
```

The loader reads all `.ts`/`.js` files from the `/skills` directory at
startup. Each file must export a `metadata` object and an `execute` function.
Files with missing or invalid metadata cause a startup error with a clear
message.

Follow the pattern from the existing hooks loader
(`src/hooks/loader.ts`) for file discovery and dynamic import.

**Tests:** `src/skills/loader.test.ts` -- test loading valid skills, rejecting
skills with missing metadata, rejecting skills with invalid metadata types.

**Acceptance:** US-09 criteria met: skills without valid metadata cannot load;
`financial`/`client_facing` skills are flagged for HITL; `read_only` skills
are exempt.

---

### Task 2.2: Skill Metadata Enforcement at Gateway Startup

**What:** Integrate the skill loader with gateway startup so that all skills
are validated before the gateway begins accepting connections.

**Where:**

- `src/gateway/server-startup.ts` -- add skill loading step to the startup
  sequence.
- `src/gateway/boot.ts` -- wire the skill registry into the gateway context.

**How:** During gateway boot (`src/gateway/boot.ts`), call the skill loader
before starting the WebSocket server. If any skill fails validation, log a
clear error and exit with a non-zero code. Pass the loaded skill registry
into the `GatewayRequestContext` so handlers can access it.

**Tests:** `src/gateway/boot.test.ts` -- add test cases for startup with
valid skills, startup failure with invalid skills.

**Acceptance:** Gateway refuses to start if any skill has malformed metadata.

---

### Task 2.3: Audit Log

**What:** Implement an append-only audit log table recording all skill
executions, HITL decisions, and system events.

**Where:**

- `src/audit/schema.ts` -- new file. SQLite table definition.
- `src/audit/store.ts` -- new file. Append-only write operations + query.
- `src/audit/types.ts` -- new file. Audit entry type definitions.

**How:** SQLite table schema:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL,          -- ISO timestamp
  action_type TEXT NOT NULL,          -- 'skill_exec' | 'hitl_decision' | 'system_event'
  skill_name  TEXT,
  actor       TEXT NOT NULL,          -- Discord user ID or 'system'
  actor_role  TEXT,                   -- Role at time of action
  input_summary  TEXT,               -- Truncated input (no PII)
  output_summary TEXT,               -- Truncated output (no PII)
  hitl_decision  TEXT,               -- 'accepted' | 'rejected' | 'expired' | null
  session_key    TEXT,
  channel_id     TEXT
);
```

Enforce append-only by not exposing UPDATE or DELETE operations. The store
module only exports `append()` and `query()` (with filters for date range,
skill name, actor).

Follow the pattern in `src/discord/audit.ts` which already implements
Discord-level audit logging.

**Tests:** `src/audit/store.test.ts` -- test appending entries, querying by
date range, querying by skill name, querying by actor. Verify no update/delete
methods are exposed.

**Acceptance:** US-06 criteria met: log includes timestamp, action type, skill
name, actor, input/output summaries, HITL decision. Entries are append-only.
Filterable by date range, skill name, or actor.

---

### Task 2.4: Audit Log -- Admin Discord Command

**What:** Create a Discord command that allows Admin users to query the audit
log from any admin-accessible channel.

**Where:**

- `skills/audit-log.ts` -- new skill file implementing the audit log query
  command.

**How:** The skill accepts filter parameters (date range, skill name, actor)
via the Discord message text. It queries the audit store and formats results
into a Discord embed or paginated text response. The skill's metadata:

```typescript
metadata: {
  name: 'audit-log',
  description: 'Query the system audit log',
  financial: false,
  client_facing: false,
  read_only: true,
}
```

This skill is only available in `#admin-only` (enforced by the channel config
from Task 1.7).

**Tests:** `skills/audit-log.test.ts` -- test query formatting, pagination,
filter parsing.

**Acceptance:** US-06 criteria met: admin can query the audit log via Discord.
Non-admin users cannot access (enforced by channel config).

---

### Task 2.5: PII Scrubber -- Context Middleware

**What:** Implement a context scrubber that replaces known PII fields with
reference tokens before sending context to the model API.

**Where:**

- `src/pii/scrubber.ts` -- new file. The scrubbing logic.
- `src/pii/types.ts` -- new file. PII field definitions and token format.
- `src/pii/resolver.ts` -- new file. Reverse resolution (tokens back to
  real values) for final output.

**How:** For MVP, use structured field replacement (as specified in the build
plan, Section 3.2.5):

1. Maintain a mapping table of client records with known PII fields: name,
   phone, email, address.
2. Before any model API call, scan the context for known PII values and
   replace them with reference tokens (e.g., `CLIENT_0042`,
   `PHONE_0042`, `EMAIL_0042`, `ADDR_0042`).
3. The model's response uses reference tokens.
4. Before presenting the response to the operator, resolve tokens back to
   real values.

The scrubber operates as middleware in the model API call path. It should be
inserted in the agent prompt pipeline where context is assembled before being
sent to Anthropic's API.

**Tests:** `src/pii/scrubber.test.ts` -- test replacement of each PII field
type, round-trip (scrub -> resolve), edge cases (PII appearing multiple
times, partial matches).

**Acceptance:** US-07 criteria met: known PII fields are replaced with tokens
before model API calls. Tokens are resolved in the final output. Admin can
inspect API call logs to verify no raw PII.

---

### Task 2.6: Background Task Framework Scaffold

**What:** Create the governed background task framework scaffold. No actual
scheduled tasks at MVP -- just the framework that enforces HITL requirements
based on output type.

**Where:**

- `src/background/types.ts` -- new file. Output type definitions and HITL
  requirement mapping.
- `src/background/executor.ts` -- new file. Task executor with HITL gate.
- `src/background/registry.ts` -- new file. Background task registration.

**How:** Define the output type classification from build plan Section 3.2.2:

```typescript
type OutputType = "internal" | "client_facing" | "financial" | "system_modify";

const HITL_REQUIRED: Record<OutputType, boolean> = {
  internal: false,
  client_facing: true,
  financial: true,
  system_modify: true,
};
```

The executor checks the output type before running a background task. If HITL
is required, it routes through the HITL approval queue (Task 1.3/1.4).

Follow the `CronService` pattern (`src/cron/service.ts`) for the service
lifecycle.

**Tests:** `src/background/executor.test.ts` -- test that tasks with
client-facing/financial/system output are routed through HITL. Internal tasks
execute directly.

**Acceptance:** Framework is scaffolded and tested. No scheduled tasks are
registered at MVP.

---

## 4. Phase 3: MVP Workflow Skills (Weeks 5--7)

### Task 3.1: Voice Transcription Pathway

**What:** Implement the voice transcription pathway using a local Whisper
model. Voice messages received in Discord are transcribed and presented back
to the sender for confirmation.

**Where:**

- `src/voice/transcribe.ts` -- new file. Whisper transcription wrapper.
- `src/voice/types.ts` -- new file. Transcription types.

**How:** OpenClaw already has voice infrastructure:

- `src/discord/voice/` -- voice channel management.
- `src/discord/voice-message.ts` -- voice message handling.
- `src/media-understanding/` -- media processing pipeline.

The transcription pathway:

1. Receive a voice message attachment in Discord (OGG/MP3 format).
2. Download the attachment to a temp directory.
3. Run the local Whisper model (`whisper` CLI or `whisper.cpp`) via
   `src/process/exec.ts` (which already provides safe command execution).
4. Return the transcribed text.

The confirmation step is handled by the Voice-to-Job-Note skill (Task 3.2).

**Tests:** `src/voice/transcribe.test.ts` -- test with a sample audio file,
error handling for missing whisper binary, timeout handling.

**Acceptance:** Voice messages are transcribed to text. Transcription errors
are handled gracefully.

---

### Task 3.2: Skill -- Voice-to-Job-Note (US-01, US-10)

**What:** Implement the voice-to-job-note workflow: voice message ->
transcribe -> confirm -> save to job record.

**Where:**

- `skills/voice-note.ts` -- new skill file.
- `src/jobs/store.ts` -- new file. Job record storage (SQLite).
- `src/jobs/types.ts` -- new file. Job record types.

**How:** Workflow:

1. Field worker sends a voice message in `#job-reports`.
2. Skill receives the message via the Discord message handler pipeline.
3. Call the transcription module (Task 3.1).
4. Post the transcription back to the field worker with Confirm / Re-record
   / Edit buttons (using `src/discord/components.ts` for interactive
   components and `src/discord/components-registry.ts` for button
   registration).
5. On Confirm: save to job record store with timestamp and sender ID.
   Create an audit log entry.
6. On Re-record: prompt for new voice message.
7. On Edit: accept corrected text, save to job record store.

Skill metadata:

```typescript
metadata: {
  name: 'voice-note',
  description: 'Transcribe voice messages to job notes',
  financial: false,
  client_facing: false,  // internal record only
  read_only: false,
}
```

HITL is handled at the sender confirmation level (the field worker confirms
the transcription), not via the approval queue.

**Tests:** `skills/voice-note.test.ts` -- test the full workflow: transcribe
-> confirm -> save. Test rejection and re-record flows. Test audit log
creation.

**Acceptance:** US-01 and US-10 criteria met. Voice message is transcribed,
confirmation flow works, job record is saved, audit entry is created.

---

### Task 3.3: Skill -- Field Report Submission (US-02)

**What:** Implement the field report submission workflow: free-text report via
Discord -> store against job record.

**Where:**

- `skills/field-report.ts` -- new skill file.

**How:** Workflow:

1. Field worker sends a message in `#job-reports` with report content.
2. Skill acknowledges receipt.
3. If job identification is ambiguous (no clear job reference), ask the
   field worker to clarify which job the report relates to.
4. Save the report to the job record store (from Task 3.2's
   `src/jobs/store.ts`).
5. Create an audit log entry.

No HITL required (internal record only).

Skill metadata:

```typescript
metadata: {
  name: 'field-report',
  description: 'Submit field reports against job records',
  financial: false,
  client_facing: false,
  read_only: false,
}
```

**Tests:** `skills/field-report.test.ts` -- test report submission, job
disambiguation, audit log creation.

**Acceptance:** US-02 criteria met. Reports are stored against job records.
Ambiguous jobs prompt for clarification.

---

### Task 3.4: Skill -- Quote Draft Preparation (US-03)

**What:** Implement the quote draft preparation workflow: job details -> AI
draft -> operator review -> HITL approval.

**Where:**

- `skills/quote-draft.ts` -- new skill file.

**How:** Workflow:

1. Office operator provides job details in `#quotes`.
2. Skill collects information (description, materials, labour estimate).
3. Call the model API to generate a draft quote (PII scrubbed via Task 2.5).
4. Present the draft to the operator in `#quotes` for review.
5. Operator can Accept, Reject, or Request Edits.
6. On Accept: mark as ready for dispatch (manual sending at MVP). Route
   through HITL approval queue since this is `client_facing: true`.
7. Create audit log entries for draft generation and approval decision.

Skill metadata:

```typescript
metadata: {
  name: 'quote-draft',
  description: 'Generate draft quotes from job details',
  financial: false,
  client_facing: true,  // HITL required
  read_only: false,
}
```

**Tests:** `skills/quote-draft.test.ts` -- test draft generation, HITL
routing, approval/rejection flows, audit log creation.

**Acceptance:** US-03 criteria met. Drafts are generated, HITL approval is
required before marking as ready, audit entries are created.

---

### Task 3.5: Skill -- Client Inquiry Triage (US-04)

**What:** Implement the client inquiry triage workflow: categorise inquiry ->
draft response -> operator review -> HITL approval.

**Where:**

- `skills/inquiry-triage.ts` -- new skill file.

**How:** Workflow:

1. Inquiry is entered/forwarded into `#inquiries`.
2. Skill categorises the inquiry using the model API (PII scrubbed):
   - New job request
   - Existing job follow-up
   - General question
   - Complaint
3. Generate a draft response appropriate to the category.
4. Present the draft and categorisation to the operator for review.
5. Route through HITL approval queue (`client_facing: true`).
6. On Accept: dispatch the response (manual at MVP).
7. Create audit log entries for categorisation and response decisions.

Skill metadata:

```typescript
metadata: {
  name: 'inquiry-triage',
  description: 'Categorise client inquiries and draft responses',
  financial: false,
  client_facing: true,  // HITL required
  read_only: false,
}
```

**Tests:** `skills/inquiry-triage.test.ts` -- test categorisation, draft
generation, HITL routing, audit log creation.

**Acceptance:** US-04 criteria met. Inquiries are categorised, drafts are
generated, HITL approval is required, audit entries are created.

---

### Task 3.6: HITL Approval via Discord (US-05)

**What:** Implement the Discord-native HITL approval flow with interactive
Accept/Reject buttons.

**Where:**

- `skills/hitl-approve.ts` -- new skill file (or extend
  `src/hitl/discord-integration.ts`).
- `src/hitl/discord-components.ts` -- new file. Discord button components
  for approval flow.

**How:** This task wires together the HITL store (Task 1.3), gateway handlers
(Task 1.4), and Discord components:

1. When a HITL-flagged action is pending, send a message to `#approvals`
   with an embed summarising the proposed action.
2. Include Accept and Reject buttons using Discord's interactive component
   system (`src/discord/components.ts`).
3. Register button interaction handlers in the components registry
   (`src/discord/components-registry.ts`).
4. Only users with Office Operator or Admin roles can interact with the
   buttons (check `SenderRoles` from Task 1.6).
5. On Accept: call `hitl.action.accept` via the HITL store.
6. On Reject: prompt for optional reason, then call `hitl.action.reject`.
7. Pending actions expire after a configurable timeout (default: 24 hours).
   Expired actions are logged.
8. All decisions create audit log entries.

**Tests:** `src/hitl/discord-components.test.ts` -- test button rendering,
role-based access check, accept/reject/expire flows, audit log creation.

**Acceptance:** US-05 criteria met. Interactive buttons work in Discord.
Role-based access is enforced. Expiry is handled.

---

### Task 3.7: PII Scrubbing Verification (US-07)

**What:** Add admin-accessible verification that PII scrubbing is working
correctly in model API calls.

**Where:**

- `src/pii/verify.ts` -- new file. Verification utility that samples recent
  API call logs.
- Extend the `audit-log` skill (Task 2.4) to include a `--verify-pii`
  subcommand.

**How:** The verification utility:

1. Reads the most recent N model API call logs.
2. Scans for known PII patterns (client names, phone numbers, emails,
   addresses from the client record store).
3. Reports whether any raw PII was found.

Expose this as a subcommand of the audit-log skill accessible in
`#admin-only`.

**Tests:** `src/pii/verify.test.ts` -- test detection of raw PII in sample
logs, clean report when no PII found.

**Acceptance:** US-07 criteria met. Admin can verify PII scrubbing is
working.

---

### Task 3.8: Role-Based Access Verification (US-08)

**What:** Verify and test that the role-based channel access configuration
(Task 1.7) correctly restricts skill access by role.

**Where:**

- `src/discord/monitor/allow-list.test.ts` -- extend with role-specific
  test cases matching the trade business channel matrix.

**How:** Write integration tests that simulate messages from users with
different roles in different channels and verify:

1. Field Workers can only interact in `#job-reports` and `#timesheets`.
2. Office Operators can interact in Field Worker channels plus
   `#operations`, `#quotes`, and `#inquiries`.
3. Admin can interact in all channels.
4. Attempting to use a skill outside permitted channels results in a
   polite denial.

**Tests:** Add test cases to the existing allow-list test suite.

**Acceptance:** US-08 criteria met. All role/channel combinations produce
correct allow/deny results.

---

## 5. Phase 4: Pilot and Observation (Week 8)

### Task 4.1: E2E Test -- Voice-to-Job-Note Workflow

**What:** Create an end-to-end test covering the complete Voice-to-Job-Note
workflow as recommended in the build plan.

**Where:**

- `src/e2e/voice-to-job-note.e2e.test.ts` -- new file.

**How:** Use the existing E2E test infrastructure (Vitest e2e config, see
`vitest.e2e.config.ts` referenced in the build plan). The test should:

1. Simulate a voice message in `#job-reports` from a Field Worker.
2. Verify transcription occurs.
3. Simulate confirmation.
4. Verify job record is saved.
5. Verify audit log entry is created.
6. Verify PII scrubbing in any model API calls.

**Tests:** The test itself is the deliverable.

**Acceptance:** E2E test passes reliably.

---

### Task 4.2: Deploy Pipeline Verification

**What:** Confirm the deployment pipeline provisioned in Task 1.9 works
correctly against the live `production` branch.

**Where:**

- `/opt/gateway/deploy.sh` -- created in Task 1.9.
- `/etc/systemd/system/gateway.service` -- created in Task 1.9.
- `/etc/systemd/system/gateway-deploy.timer` -- created in Task 1.9.

**How:**

1. Merge a trivial change (e.g. a comment) from `main-internal` into
   `production` via PR.
2. Wait for the nightly deploy timer to fire (or trigger it manually:
   `sudo systemctl start gateway-deploy.service`).
3. Verify the deploy log (`/var/log/gateway-deploy.log`) shows the new
   commit hash.
4. Verify the gateway process is running the new build (`/status` Discord
   command or `systemctl status gateway.service`).
5. Test the emergency rollback procedure from INFRASTRUCTURE.md Section 4.5:
   reset to the previous commit, rebuild, restart, verify service recovers.

**Acceptance:** Deploy pipeline picks up `production` branch changes and
restarts the gateway. Rollback procedure restores the previous version
cleanly. All steps verified on the production device.

---

### Task 4.3: Production Readiness Checklist

**What:** Create a checklist of items to verify before starting the pilot.

**Where:**

- `docs/internal/PILOT_CHECKLIST.md` -- new file.

**How:** Checklist items:

- [ ] All unit tests pass (`pnpm test`).
- [ ] All integration tests pass.
- [ ] E2E test passes (Task 4.1).
- [ ] Build succeeds (`pnpm build`).
- [ ] Type checking passes (`pnpm check`).
- [ ] Coverage thresholds met (70% lines/branches/functions/statements).
- [ ] Discord server configured per checklist (Task 1.8).
- [ ] Gateway config validated with role/channel matrix.
- [ ] Deploy pipeline tested (Task 4.2).
- [ ] Backup procedure tested.
- [ ] `.env` file configured on business device.
- [ ] SSH access restricted per INFRASTRUCTURE.md Section 6.
- [ ] All API keys rotated / fresh.
- [ ] Audit log verified empty / initialised.
- [ ] PII scrubbing verified (Task 3.7).

**Acceptance:** Checklist complete. All items checked off before pilot begins.

---

## 6. New Files Summary

| Path                                       | Purpose                                   |
| ------------------------------------------ | ----------------------------------------- |
| `src/hitl/schema.ts`                       | HITL pending_actions SQLite table         |
| `src/hitl/store.ts`                        | HITL CRUD operations                      |
| `src/hitl/types.ts`                        | HITL type definitions                     |
| `src/hitl/middleware.ts`                   | Skill execution gate                      |
| `src/hitl/skill-metadata.ts`               | Skill metadata validation                 |
| `src/hitl/gateway-handlers.ts`             | Gateway WebSocket method handlers         |
| `src/hitl/discord-components.ts`           | Discord interactive buttons               |
| `src/skills/loader.ts`                     | Closed skill registry loader              |
| `src/skills/types.ts`                      | Skill interface and metadata types        |
| `src/skills/registry.ts`                   | In-memory skill registry                  |
| `src/audit/schema.ts`                      | Audit log SQLite table                    |
| `src/audit/store.ts`                       | Append-only audit log operations          |
| `src/audit/types.ts`                       | Audit entry type definitions              |
| `src/pii/scrubber.ts`                      | PII scrubbing middleware                  |
| `src/pii/types.ts`                         | PII field definitions                     |
| `src/pii/resolver.ts`                      | Token-to-PII reverse resolution           |
| `src/pii/verify.ts`                        | PII scrubbing verification                |
| `src/voice/transcribe.ts`                  | Whisper transcription wrapper             |
| `src/voice/types.ts`                       | Transcription types                       |
| `src/background/types.ts`                  | Background task output types              |
| `src/background/executor.ts`               | Background task executor                  |
| `src/background/registry.ts`               | Background task registration              |
| `src/jobs/store.ts`                        | Job record storage                        |
| `src/jobs/types.ts`                        | Job record types                          |
| `skills/voice-note.ts`                     | Voice-to-Job-Note skill                   |
| `skills/field-report.ts`                   | Field Report Submission skill             |
| `skills/quote-draft.ts`                    | Quote Draft Preparation skill             |
| `skills/inquiry-triage.ts`                 | Client Inquiry Triage skill               |
| `skills/audit-log.ts`                      | Audit Log query skill                     |
| `skills/hitl-approve.ts`                   | HITL Accept/Reject approval skill         |
| `src/e2e/voice-to-job-note.e2e.test.ts`    | E2E test for Voice-to-Job-Note            |
| `docs/internal/DISCORD_CONFIG_TEMPLATE.md` | Gateway config template                   |
| `docs/internal/DISCORD_SETUP_CHECKLIST.md` | Discord server setup guide                |
| `docs/internal/PILOT_CHECKLIST.md`         | Pre-pilot readiness checklist             |
| `docs/internal/CONFIGURATION_REFERENCE.md` | Filled-in infrastructure reference values |

---

## 7. Existing Files to Modify

| Path                                             | Change                                                   |
| ------------------------------------------------ | -------------------------------------------------------- |
| `src/gateway/server-methods/skills.ts`           | Remove `skills.install` handler                          |
| `src/infra/skills-remote.ts`                     | Remove or stub                                           |
| `src/agents/skills-install.ts`                   | Remove                                                   |
| `src/gateway/server-methods-list.ts`             | Add HITL handlers                                        |
| `src/auto-reply/templating.ts`                   | Add `SenderRoles` to `MsgContext`                        |
| `src/discord/monitor/message-handler.process.ts` | Populate `SenderRoles`                                   |
| `src/gateway/server-startup.ts`                  | Add skill loading step                                   |
| `src/gateway/boot.ts`                            | Wire skill registry into context                         |
| `src/discord/monitor/allow-list.test.ts`         | Add role/channel matrix test cases (Task 3.8)            |
| `SECURITY.md`                                    | Replace upstream content with closed-skill policy        |
| `CHANGELOG.md`                                   | Add fork-specific entries beginning with ClawHub removal |

---

## 8. Dependencies Between Tasks

```
Task 1.1 (Remove ClawHub) ─── standalone, do first
Task 1.2 (Remove Moltbook) ── standalone, do first
Task 1.3 (HITL Schema) ────── standalone
Task 1.4 (HITL Gateway) ───── depends on 1.3
Task 1.5 (HITL Middleware) ── depends on 1.3, 1.4
Task 1.6 (SenderRoles) ────── standalone
Task 1.7 (Channel Config) ── depends on 1.6
Task 1.8 (Discord Docs) ───── depends on 1.7
Task 1.9 (Device Provision) ─ standalone (infra); can start after fork

Task 2.1 (Skill Loader) ───── standalone
Task 2.2 (Startup Gate) ───── depends on 2.1
Task 2.3 (Audit Log) ──────── standalone
Task 2.4 (Audit Command) ──── depends on 2.3, 2.1
Task 2.5 (PII Scrubber) ───── standalone
Task 2.6 (Background FW) ──── depends on 1.3, 1.5

Task 3.1 (Transcription) ──── standalone
Task 3.2 (Voice Note) ─────── depends on 3.1, 2.1, 2.3, jobs store
Task 3.3 (Field Report) ───── depends on 2.1, 2.3, jobs store
Task 3.4 (Quote Draft) ────── depends on 2.1, 2.3, 2.5, 1.5
Task 3.5 (Inquiry Triage) ── depends on 2.1, 2.3, 2.5, 1.5
Task 3.6 (HITL Discord) ───── depends on 1.3, 1.4, 1.6
Task 3.7 (PII Verify) ─────── depends on 2.5, 2.3
Task 3.8 (Role Verify) ────── depends on 1.7

Task 4.1 (E2E Test) ────────── depends on 3.2, all Phase 2
Task 4.2 (Deploy Verify) ──── depends on 1.9 (production device provisioned)
Task 4.3 (Pilot Checklist) ── depends on all above
```

---

## 9. Pre-Commit Verification

Every commit must pass:

```bash
pnpm build && pnpm check && pnpm test
```

Coverage thresholds: 70% lines/branches/functions/statements (V8).

---

## 10. User Story to Task Mapping

| User Story                              | Primary Tasks      |
| --------------------------------------- | ------------------ |
| US-01: Voice-to-Job-Note                | 3.1, 3.2           |
| US-02: Field Report Submission          | 3.3                |
| US-03: Quote Draft Preparation          | 3.4                |
| US-04: Client Inquiry Triage            | 3.5                |
| US-05: HITL Approval via Discord        | 1.3, 1.4, 1.5, 3.6 |
| US-06: Audit Log Access                 | 2.3, 2.4           |
| US-07: PII Scrubbing Verification       | 2.5, 3.7           |
| US-08: Role-Based Channel Access        | 1.6, 1.7, 3.8      |
| US-09: Skill Metadata Enforcement       | 2.1, 2.2           |
| US-10: Voice Transcription Confirmation | 3.1, 3.2           |
