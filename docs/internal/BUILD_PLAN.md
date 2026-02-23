# Build Plan

**Trade Business Automation Assistant -- MVP**\
OpenClaw-Derived Architecture | February 2026 | DRAFT v2.1 (Refined)

---

## 1. Overview

This document details the technical build plan for a purpose-built AI automation
assistant for a small trade business. It covers the initial fork strategy,
architectural departures from OpenClaw upstream, the target MVP state, and
supporting user stories.

This plan should be read alongside the Business Case document, which covers cost
analysis and risk assessment. The build targets an 8-week proof-of-concept, with
a narrow MVP scope designed to validate core assumptions before broader
investment.

---

## 2. Fork Strategy

### 2.1 Rationale for Forking

OpenClaw is MIT licensed, permitting unrestricted commercial use and
modification. A fork is preferred over a direct deployment for three reasons:

- The community ClawHub skill registry represents a documented security risk; a
  fork allows its complete removal.
- The project is transitioning maintainers (Steinberger is joining OpenAI),
  making upstream tracking unreliable.
- Business workflows require deterministic, audited behaviour -- not a
  general-purpose autonomous agent.

### 2.2 Fork Procedure

1. Identify the most recent stable release tag on the `openclaw/openclaw` GitHub
   repository prior to the maintainer transition announcement (14 February 2026).
   Prefer a tagged release over a commit hash if available.
2. Fork the repository into the organisation's GitHub account. Rename the default
   branch to `main-internal` to clearly distinguish from upstream.
3. Immediately remove the ClawHub skill registry module and all dynamic
   skill-loading endpoints. Document it in `CHANGELOG.md` as the first commit
   after forking.
4. Establish a `SECURITY.md` that documents the closed-skill policy.
5. Pin all transitive dependencies. Enable dependency scanning but review changes
   before merging.
6. Do not set up an upstream remote. The fork is intentionally divergent.
   Security patches from upstream should be reviewed manually and cherry-picked
   selectively.

> **Note:** The fork is public and open-source. The MIT licence is retained. The
> repository lives at <https://github.com/CrowBe/openclaw4busyness>.

---

## 3. Architectural Changes

### 3.1 Removals

| Component                                                       | Reason                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| **ClawHub skill registry**                                      | Primary vector for third-party code injection. Entire module removed. |
| **Dynamic skill installation at runtime**                       | No skill may be loaded without a build/deploy cycle.                  |
| **Proactive/cron-triggered autonomous actions (unconstrained)** | Replaced with governed background task framework.                     |
| **Moltbook/social agent integration**                           | Not relevant; increases attack surface.                               |
| **Multi-user single-scope model**                               | Replaced with role-scoped permission model.                           |

### 3.2 Additions and Modifications

#### 3.2.1 Human-in-the-Loop (HITL) Approval Queue

The gateway maintains a `pending_actions` table (SQLite). When a HITL-flagged
skill would execute, it writes its proposed action to this table and sends the
operator a confirmation message via Discord with Accept/Reject options. Only on
Accept does the action execute. Rejected actions are logged with a reason.

**Design rule:** No skill carrying `financial: true` or `client_facing: true`
metadata may bypass the approval queue. Enforced at gateway middleware layer.

> **Implementation Note:** The HITL queue should follow the gateway method
> registration pattern (`GatewayRequestHandlers` in
> `src/gateway/server-methods/types.ts`) and use the WebSocket protocol schema
> infrastructure (`src/gateway/protocol/schema/`). The existing exec-approvals
> system (`src/gateway/server-methods/exec-approvals.ts`) demonstrates the
> pattern: validated params -> snapshot-based state -> hash-guarded updates. The
> hooks system (`src/hooks/`, `src/gateway/hooks.ts`) is also relevant for async
> event-driven approval flows.

#### 3.2.2 Governed Background Task Framework

Output type determines HITL requirement:

| Output type                           | HITL required? | Examples                                       |
| ------------------------------------- | -------------- | ---------------------------------------------- |
| Internal/informational                | No             | Summaries, digests, drafts for internal review |
| Client-facing communication           | Yes            | Any message intended for a client              |
| Financial commitment                  | Yes            | Purchase orders, quotes, invoices              |
| System modification (external writes) | Yes            | Website publish, external API writes           |

**Design rule:** Background tasks writing to external systems must pass through
HITL regardless of content.

#### 3.2.3 Role-Scoped User Permission Model

Discord channel/role structure:

| Role                | Channels                               | Capabilities                                                                   |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| **Field Worker**    | `#job-reports`, `#timesheets`          | Voice-to-job-note, field report submission                                     |
| **Office Operator** | `#operations`, `#quotes`, `#inquiries` | All Field Worker skills + quote draft, inquiry triage, HITL approval/rejection |
| **Admin**           | All channels, all skills               | Audit log, system status, skill deployment                                     |

> **Implementation Note -- Existing Infrastructure:** OpenClaw's Discord
> extension already supports role-scoped access natively. The following
> capabilities are available out of the box:
>
> - **Role-based access gating** via `channelConfig.roles` /
>   `guildConfig.roles` allowlist in `src/discord/monitor/allow-list.ts`
> - **Per-channel skill filtering** via `channelConfig.skills` -- configured in
>   `channels.discord.guilds.<id>.channels.<channel-id>.skills`
> - **Per-channel system prompts** via `channelConfig.systemPrompt`
> - **Agent routing by role/channel** via bindings config in
>   `src/routing/resolve-route.ts`
>
> The gateway stays single-user. Discord channels and roles scope tool
> availability. No RBAC code surgery is needed.
>
> **One gap:** Sender role IDs are consumed during preflight but not forwarded to
> `MsgContext`. Adding a `SenderRoles` field to `MsgContext` is the one small
> code change needed.

#### 3.2.4 Closed Skill Registry

Skills are plain TypeScript modules in `/skills`, loaded at gateway startup only.
Each skill exports metadata: `name`, `description`, `financial`, `client_facing`,
`read_only`.

#### 3.2.5 PII Minimisation in Model Context

Context scrubber middleware replaces PII with reference tokens (e.g.
`CLIENT_0042`) before sending to model API.

> **Implementation Note:** For MVP, use structured field replacement: scrub known
> client fields (name, phone, email, address) and pass reference IDs to the
> model. This is deterministic and testable. General-purpose NER-based free-text
> scrubbing is a post-MVP refinement.

#### 3.2.6 Voice Transcription Pathway

Voice input transcribed using local Whisper model. Transcription presented back
to sender for confirmation before any further action.

#### 3.2.7 Audit Log

All skill executions written to append-only audit log table. Accessible only to
admin operator.

---

## 4. Target MVP State

### 4.1 MVP Workflows

| Workflow                | Actor           | Description                                                   | HITL                      |
| ----------------------- | --------------- | ------------------------------------------------------------- | ------------------------- |
| Voice-to-Job-Note       | Field Worker    | Voice message -> transcribe -> confirm -> write to job record | Yes (sender confirms)     |
| Field Report Submission | Field Worker    | Free-text/structured report via Discord                       | No (internal record only) |
| Quote Draft Preparation | Office Operator | Job details -> draft quote -> operator reviews/approves       | Yes                       |
| Client Inquiry Triage   | Office Operator | Categorise inquiry, prepare draft response                    | Yes                       |

### 4.2 Build Phases

| Phase                                      | Weeks | Deliverables                                                                           |
| ------------------------------------------ | ----- | -------------------------------------------------------------------------------------- |
| **Phase 1: Repository and Infrastructure** | 1--2  | Fork, ClawHub removed, HITL queue schema, role-scoped router, Discord server, hardware |
| **Phase 2: Core Skill Framework**          | 3--4  | Skill loader, metadata enforcement, audit log, PII scrubber, background task scaffold  |
| **Phase 3: MVP Workflow Skills**           | 5--7  | All 4 skills implemented, HITL and role-scoping verified                               |
| **Phase 4: Pilot and Observation**         | 8     | Real usage, issues triaged, success criteria evaluated                                 |

> **Revised Estimates:** The 8-week target is tight but feasible given the RBAC
> simplification (see Section 3.2.3 -- the role-scoped permission model maps
> directly onto existing OpenClaw Discord infrastructure, eliminating what would
> have been 1--2 weeks of custom RBAC development). A 2--3 week buffer is
> recommended to account for integration surprises and pilot feedback loops.
> Additionally, background task governance (Section 3.2.2) can be deferred since
> no scheduled skills are required at MVP -- the governed framework scaffold is
> sufficient; actual scheduled tasks are a post-MVP concern.

### 4.3 Testing Strategy

| Layer                 | Tool                                               | Scope                                                                     |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| **Unit tests**        | Vitest (existing infra at `vitest.unit.config.ts`) | HITL queue logic, PII scrubber, metadata enforcement, skill loader        |
| **Integration tests** | Vitest                                             | Role-based message routing, approval flow state machine, audit log writes |
| **E2E tests**         | Vitest (e2e config)                                | At least one complete workflow end-to-end (Voice-to-Job-Note recommended) |

**Pre-commit check:**

```bash
pnpm build && pnpm check && pnpm test
```

All tests must pass before merge. Coverage thresholds follow the upstream
convention (70% lines/branches/functions/statements via V8).

---

## 5. User Stories

### US-01: Voice-to-Job-Note (Field Worker)

**As a** field worker,\
**I want to** send a voice message to the assistant in Discord,\
**So that** my spoken notes are transcribed and saved as a job record without
needing to type on-site.

**Acceptance Criteria:**

1. Field worker sends a voice message in `#job-reports`.
2. The assistant transcribes the audio using the local Whisper model.
3. The transcription is posted back to the field worker in the same channel for
   confirmation.
4. On confirmation, the note is saved to the job record store with a timestamp
   and the sender's identity.
5. If the field worker rejects the transcription, they are prompted to re-record
   or manually edit.
6. An audit log entry is created for the transcription and confirmation steps.

---

### US-02: Field Report Submission (Field Worker)

**As a** field worker,\
**I want to** submit a structured or free-text field report via Discord,\
**So that** site observations are recorded without waiting until I return to the
office.

**Acceptance Criteria:**

1. Field worker sends a message in `#job-reports` with report content.
2. The assistant acknowledges receipt and stores the report against the relevant
   job record.
3. If job identification is ambiguous, the assistant asks the field worker to
   clarify which job the report relates to.
4. No HITL approval is required (internal record only).
5. The report is visible to Office Operators and Admin in the job record.
6. An audit log entry is created.

---

### US-03: Quote Draft Preparation (Office Operator)

**As an** office operator,\
**I want to** provide job details and receive a draft quote from the assistant,\
**So that** I can review, adjust, and send quotes faster.

**Acceptance Criteria:**

1. Office operator provides job details in `#quotes` (description, materials,
   labour estimate).
2. The assistant generates a draft quote using the provided information and any
   relevant job records.
3. The draft is presented to the operator for review in the same channel.
4. The operator can accept, reject, or request edits to the draft.
5. Accepted quotes are marked as ready for dispatch (actual sending is manual at
   MVP).
6. The HITL approval queue is used -- the draft cannot be sent to a client
   without explicit operator acceptance.
7. An audit log entry is created for each draft generation and approval decision.

---

### US-04: Client Inquiry Triage (Office Operator)

**As an** office operator,\
**I want** incoming client inquiries to be categorised and have a draft response
prepared,\
**So that** I can respond to clients promptly with consistent messaging.

**Acceptance Criteria:**

1. A client inquiry is forwarded or entered into `#inquiries`.
2. The assistant categorises the inquiry (e.g. new job request, existing job
   follow-up, general question, complaint).
3. A draft response appropriate to the category is generated.
4. The draft response is presented to the operator for review.
5. The operator can accept, reject, or edit the draft before it is sent.
6. The HITL approval queue is used -- no client-facing response is sent without
   explicit operator acceptance.
7. An audit log entry is created for categorisation and response decisions.

---

### US-05: HITL Approval via Discord (Office Operator / Admin)

**As an** office operator or admin,\
**I want to** receive approval requests in Discord with Accept/Reject buttons,\
**So that** I can review and authorise actions without leaving my primary
communication tool.

**Acceptance Criteria:**

1. When a HITL-flagged action is proposed, a message is sent to the designated
   approval channel with a summary of the proposed action.
2. The message includes Accept and Reject interactive buttons.
3. Only users with the Office Operator or Admin role can interact with the
   buttons.
4. Accepting triggers execution of the proposed action.
5. Rejecting prompts for an optional reason, which is logged.
6. The pending action expires after a configurable timeout (default: 24 hours)
   and is logged as expired.
7. An audit log entry is created for every approval, rejection, and expiry.

---

### US-06: Audit Log Access (Admin)

**As an** admin,\
**I want to** view a complete audit log of all assistant actions,\
**So that** I can verify compliance, investigate issues, and maintain
accountability.

**Acceptance Criteria:**

1. Admin can request the audit log via a command in any admin-accessible channel.
2. The log includes: timestamp, action type, skill name, actor (user or system),
   input summary, output summary, HITL decision (if applicable).
3. Log entries are append-only and cannot be modified or deleted by any user.
4. The log can be filtered by date range, skill name, or actor.
5. Non-admin users cannot access the audit log.

---

### US-07: PII Scrubbing Verification (Admin)

**As an** admin,\
**I want** assurance that client PII is not sent to the model API in raw form,\
**So that** client data is protected even if the model provider's data handling
changes.

**Acceptance Criteria:**

1. Before any model API call, the context scrubber replaces known PII fields with
   reference tokens (e.g. `CLIENT_0042`).
2. The model's response uses reference tokens, which are resolved back to real
   values only in the final output to the operator.
3. Admin can inspect a sample of recent model API call logs to verify no raw PII
   is present.
4. The scrubber handles: client name, phone number, email address, and physical
   address at minimum.

---

### US-08: Role-Based Channel Access (All Roles)

**As a** system administrator,\
**I want** each Discord role to only have access to the channels and skills
appropriate to their role,\
**So that** field workers cannot accidentally trigger financial or client-facing
actions.

**Acceptance Criteria:**

1. Field Workers can only interact with the assistant in `#job-reports` and
   `#timesheets`.
2. Office Operators can interact in Field Worker channels plus `#operations`,
   `#quotes`, and `#inquiries`.
3. Admin can interact in all channels.
4. Attempting to use a skill outside a user's permitted channels results in a
   polite denial message.
5. Channel and role mappings are defined in configuration, not hard-coded.

---

### US-09: Skill Metadata Enforcement (System)

**As the** system,\
**I want** every registered skill to declare its metadata (financial,
client_facing, read_only),\
**So that** the HITL and permission enforcement layers can operate correctly.

**Acceptance Criteria:**

1. A skill without valid metadata cannot be loaded by the gateway at startup.
2. Skills marked `financial: true` or `client_facing: true` are automatically
   routed through the HITL approval queue.
3. Skills marked `read_only: true` are exempt from HITL (they do not modify
   state).
4. Metadata is validated at load time -- a malformed or missing metadata export
   causes a startup error with a clear message identifying the skill.

---

### US-10: Voice Transcription Confirmation (Field Worker)

**As a** field worker,\
**I want to** see the text transcription of my voice message before it is acted
upon,\
**So that** I can catch transcription errors before they become part of the job
record.

**Acceptance Criteria:**

1. After transcription, the text is posted back to the field worker in the same
   channel.
2. The field worker is prompted with Confirm / Re-record / Edit options.
3. Confirming proceeds to save the transcription as a job note.
4. Re-record discards the current transcription and prompts for a new voice
   message.
5. Edit allows the field worker to send a corrected text version.
6. No downstream action occurs until the field worker explicitly confirms.

---

## 6. Definition of Done

A skill or workflow is considered done when all of the following are satisfied:

- All acceptance criteria pass in a test conversation on the deployed gateway.
- Skill has been code-reviewed.
- HITL flag and metadata correctly set and verified.
- Audit log entry produced for every execution path.
- No raw PII in model API call logs.
- Skill documented in internal skill registry.
- Unit, integration, and (where applicable) E2E tests pass.

---

## 7. Post-MVP Considerations

- Scheduled background tasks (framework scaffolded at MVP; skills post-MVP).
- Website content pipeline with HITL gate.
- Calendar/scheduling integration.
- Direct quote document generation and email dispatch (HITL mandatory).
- Xero/MYOB integration (HITL mandatory).
- Additional role types.
- Local model fallback via Ollama.
- General-purpose NER-based PII scrubbing for free-text fields.

**Governance note:** Any post-MVP skill involving financial commitment or
client-facing output must follow the same HITL architecture.
