# Development Blockers

**Trade Business Automation Assistant -- MVP**\
Last updated: February 2026

This document lists outstanding blockers and gaps between the
`docs/internal/IMPLEMENTATION_PLAN.md` task list and the current codebase
state. Ordered by dependency (earlier items block later ones).

---

## Blocker 1 — HITL Discord notification not wired (Task 3.6)

**Status:** Partial

`src/hitl/discord-approval.ts` contains `buildHitlApprovalMessage()` which
formats the approval prompt, but nothing calls it. When `hitl.submit` is
invoked (gateway method in `src/gateway/server-methods/hitl.ts:164`), it
creates the pending action in SQLite and returns — no Discord message is sent.

**What is missing:**

- After `store.createPendingAction(...)` in `hitl.submit`, send the approval
  message to the configured `#approvals` channel using the existing Discord
  client. The `buildHitlApprovalMessage()` helper is ready.
- Wire reaction/command handling: when the operator reacts ✅/❌ or sends
  `hitl accept <id>` / `hitl reject <id> <reason>`, call
  `store.acceptAction` / `store.rejectAction` and reply with the outcome.
- Check `SenderRoles` (already in `MsgContext` — `src/auto-reply/templating.ts:116`)
  to gate the accept/reject path to `Office Operator` and `Admin` roles only.

**Files to touch:**

- `src/gateway/server-methods/hitl.ts` — fire notification after `createPendingAction`
- `src/hitl/discord-approval.ts` — extend with a `sendHitlApprovalMessage()` that uses the Discord client
- `src/discord/monitor/message-handler.process.ts` (or equivalent) — handle
  `hitl accept/reject` command routing

---

## Blocker 2 — `audit-log` skill is a stub (Task 2.4)

**Status:** Placeholder only

`skills/audit-log.ts` returns a hardcoded message:

> "Connect AuditStore to return real results."

`src/audit/store.ts` exists with full CRUD. The skill just needs to call it.

**What is missing:**

- Import `getAuditStore` from `src/audit/store.ts` in `skills/audit-log.ts`.
- Replace the placeholder with a real `store.queryEvents(...)` call.
- Wire `createAuditEvent(...)` calls at skill execution boundaries (skill loader
  or HITL middleware) so the log has actual entries.

**Files to touch:**

- `skills/audit-log.ts` — call `AuditStore`
- `src/skills/loader.ts` — emit audit events on skill execution start/end
- `src/hitl/middleware.ts` (or `store.ts`) — emit audit events on HITL accept/reject

---

## Blocker 3 — `src/jobs/store.ts` is in-memory only (Task 2.3)

**Status:** In-memory array, data lost on restart

`src/jobs/store.ts` uses a module-level `const notes: JobNote[] = []`. This
means job notes disappear when the gateway process restarts.

**What is missing:**

- Replace the in-memory array with SQLite (follow the pattern in
  `src/hitl/schema.ts` / `src/hitl/store.ts`).
- Create `src/jobs/schema.ts` with the `job_notes` table DDL and `getJobStore()`
  factory (using `better-sqlite3` like the HITL store).

**Files to touch:**

- `src/jobs/store.ts` — replace array with SQLite
- `src/jobs/schema.ts` — new file, table DDL
- `src/jobs/types.ts` — already exists, review if JobNote needs `id`/`created_at` (it does)

---

## Blocker 4 — Background executor not connected to gateway startup

**Status:** Implemented but not started

`src/background/executor.ts` has `registerTask()` and `startAllTasks()` but
nothing calls `startAllTasks()` during gateway initialisation.

No background tasks are defined yet (post-MVP scope per build plan), so this
blocker is **low priority** — it only matters when the first scheduled task is
added. Document here for completeness.

**What is missing:**

- Call `startAllTasks()` from the gateway startup sequence (wherever
  `gateway.start()` or equivalent runs).

---

## Blocker 5 — Voice transcription requires external `whisper` CLI

**Status:** Runtime dependency not enforced at startup

`src/voice/transcribe.ts` calls the `whisper` binary via `spawnSync`. If
`whisper` is absent, the `voice-note` skill fails at runtime with a clear
error message (`isWhisperAvailable()` is checked), but nothing warns the
operator at gateway startup.

**What is missing:**

- Add a startup check (logged warning only, not a fatal error) if `whisper` is
  not found.
- Document the install step in `docs/internal/INFRASTRUCTURE.md`.

---

## Notes

- All four MVP workflow skills (`voice-note`, `field-report`, `quote-draft`,
  `inquiry-triage`) are implemented and registered. Core infrastructure
  (`src/hitl/`, `src/pii/`, `src/skills/`, `src/audit/`, `src/voice/`,
  `src/jobs/`) is in place.
- `SenderRoles` is populated in `MsgContext` (Task 1.6 complete).
- HITL gateway methods are registered and implemented (Task 1.4 complete).
- HITL middleware gate logic (`checkHitlRequired`) is implemented (Task 1.5
  complete).
- Blockers 1 and 2 are the highest-priority items before a functional pilot.
