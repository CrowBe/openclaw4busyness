# Pilot Deployment Checklist

## Pre-Deployment

### Infrastructure

- [ ] VPS/cloud instance provisioned (Ubuntu 22.04 LTS or similar)
- [ ] Node.js 22+ installed
- [ ] Whisper CLI installed (`pip install openai-whisper` or `brew install openai-whisper`)
- [ ] SQLite3 available (usually bundled with Node.js 22+)
- [ ] OpenClaw installed and configured
- [ ] Bot token set in config (`channels.discord.token`)

### Discord Setup

- [ ] Discord application created at discord.com/developers
- [ ] Bot added to server with correct permissions (see DISCORD_SETUP_CHECKLIST.md)
- [ ] Roles created: Admin, Office Operator, Field Worker
- [ ] Channels created with correct role overrides (see DISCORD_CONFIG_TEMPLATE.md)
- [ ] Channel IDs recorded and added to OpenClaw config

### Security

- [ ] skills.install gateway method is disabled (fork default) - **VERIFY**
- [ ] Skills directory contains only reviewed, committed skill files
- [ ] HITL approval channel configured (`#approvals`)
- [ ] Admin role is restricted to trusted staff only
- [ ] Bot token stored securely (not in git)
- [ ] `SECURITY.md` closed-skill policy reviewed by team

### Data

- [ ] SQLite storage path configured
- [ ] hitl.db will be created on first startup
- [ ] Backup strategy for hitl.db and config files

## Smoke Tests

### Basic Connectivity

- [ ] Bot appears online in Discord
- [ ] Bot responds to @mention in `#job-reports`
- [ ] Bot does NOT respond in `#timesheets` (no skill configured)

### Role-Based Access

- [ ] Field Worker role: can use `#job-reports` (voice-note, field-report)
- [ ] Field Worker role: cannot use `#admin-only` (audit-log)
- [ ] Office Operator role: can use `#operations` (quote-draft, inquiry-triage)
- [ ] Admin role: can use `#admin-only` and all other channels

### HITL Flow

- [ ] `voice-note` skill triggers HITL approval request in `#approvals`
- [ ] Approver can accept with `hitl accept <id>`
- [ ] Approver can reject with `hitl reject <id> <reason>`
- [ ] Expired actions (>24h) are automatically marked expired

### PII Scrubbing

- [ ] Phone numbers in voice notes are scrubbed to `[PHONE]`
- [ ] Email addresses in field reports are scrubbed to `[EMAIL]`
- [ ] ABN/TFN in any field are scrubbed to `[TAX-ID]`

### Audit Log

- [ ] Admin can query `audit-log` skill in `#admin-only`
- [ ] Audit log shows skill executions
- [ ] Audit log shows HITL decisions

## Post-Deployment

### Monitoring

- [ ] Gateway logs are accessible
- [ ] Error rate is acceptable
- [ ] HITL queue is not building up (approvals happening promptly)

### Training

- [ ] Field Workers know how to submit voice notes via Discord
- [ ] Office Operators know how to approve/reject HITL actions
- [ ] Admins know how to query the audit log

### Documentation

- [ ] Field Worker quick-start guide shared
- [ ] Operator approval guide shared
- [ ] Escalation path documented for issues

## Post-Pilot Review Triggers

Escalate immediately if:

- PII appears unredacted in Discord messages
- Unapproved actions execute without HITL approval
- Users gain access to channels beyond their role
- Bot responds with internal config or stack traces
