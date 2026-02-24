# Development Blockers

**Trade Business Automation Assistant -- MVP**\
Last updated: February 2026

This document lists outstanding blockers and gaps between the
`docs/internal/IMPLEMENTATION_PLAN.md` task list and the current codebase
state. Ordered by dependency (earlier items block later ones).

---

## Resolved Blockers

### ~~Blocker 1 — HITL Discord notification not wired (Task 3.6)~~

**Status:** Resolved

`src/gateway/server-methods/hitl.ts` now calls `fireHitlDiscordNotification()`
after `createPendingAction()`, which uses `buildHitlApprovalMessage()` and
`sendHitlApprovalMessage()` from `src/hitl/discord-approval.ts`. Role-gated
accept/reject is enforced via `HITL_OPERATOR_ROLE_IDS`.

---

### ~~Blocker 2 — `audit-log` skill is a stub (Task 2.4)~~

**Status:** Resolved

`skills/audit-log.ts` imports `getAuditStore()` from `src/audit/store.ts` and
performs real queries with filters. A `verify-pii` subcommand was also added to
scan audit entries for unredacted PII.

---

### ~~Blocker 3 — `src/jobs/store.ts` is in-memory only (Task 2.3)~~

**Status:** Resolved

`src/jobs/store.ts` now uses SQLite via `node:sqlite`. Schema lives in
`src/jobs/schema.ts`. Singleton pattern with `getJobStore()`.

---

### ~~Blocker 4 — Background executor not connected to gateway startup~~

**Status:** Resolved

`src/gateway/server-startup.ts` calls `startAllTasks()` from
`src/background/executor.ts` during sidecar startup. A higher-level
`src/background/registry.ts` provides HITL-aware task registration with
output-type classification.

---

### ~~Blocker 5 — Voice transcription requires external `whisper` CLI~~

**Status:** Resolved

`src/gateway/server-startup.ts` checks `isWhisperAvailable()` at startup and
logs a warning if the binary is absent. Install instructions are documented in
`docs/internal/INFRASTRUCTURE.md` Section 10.

---

## Remaining Work (Code)

All code blockers are resolved. The remaining items are infrastructure and
operational tasks that require the physical production device:

### Task 1.9 — Production Device Provisioning

**Status:** Not started (requires hardware)

Create the `gateway` OS user, install systemd units, deploy script, backup
script, SSH hardening, and `.env` configuration on the business device. See
`docs/internal/INFRASTRUCTURE.md` for the full procedure.

### Task 4.2 — Deploy Pipeline Verification

**Status:** Not started (depends on Task 1.9)

Verify the nightly deploy timer picks up `production` branch changes and
restarts the gateway. Test the emergency rollback procedure.

### `docs/internal/CONFIGURATION_REFERENCE.md`

**Status:** Not started (depends on Task 1.9)

Fill in the configuration reference table from INFRASTRUCTURE.md Section 11
with actual device hostname, IPs, channel IDs, role IDs, and Backblaze bucket
name after provisioning.

---

## Notes

- All four MVP workflow skills (`voice-note`, `field-report`, `quote-draft`,
  `inquiry-triage`) are implemented and registered.
- Core infrastructure (`src/hitl/`, `src/pii/`, `src/skills/`, `src/audit/`,
  `src/voice/`, `src/jobs/`, `src/background/`) is complete.
- PII resolver (`src/pii/resolver.ts`) supports token-to-PII round-trip.
- PII verification (`src/pii/verify.ts`) scans audit entries for leaks.
- Background task registry (`src/background/registry.ts`) enforces HITL
  requirements based on output type.
- E2E test covers the voice-to-job-note pipeline
  (`test/voice-to-job-note.e2e.test.ts`).
- `SenderRoles` is populated in `MsgContext` (Task 1.6 complete).
- HITL gateway methods are registered and implemented (Task 1.4 complete).
- HITL middleware gate logic (`checkHitlRequired`) is implemented (Task 1.5
  complete).
- Skill execution emits audit events via `src/skills/registry.ts`.
