# Security Policy

This is a purpose-built fork of [OpenClaw](https://github.com/openclaw/openclaw), adapted for trade business automation. The security model has been tightened for business use.

## Reporting

If you believe you've found a security issue, please report it via [GitHub private vulnerability reporting](https://github.com/CrowBe/openclaw4busyness/security/advisories/new) on this repository.

### Required in Reports

1. **Title**
2. **Severity Assessment**
3. **Impact**
4. **Affected Component**
5. **Technical Reproduction**
6. **Demonstrated Impact**
7. **Environment**
8. **Remediation Advice**

## Closed Skill Registry

This fork enforces a closed skill registry. All skills are plain TypeScript modules committed to version control. The following are prohibited:

- **No dynamic skill installation at runtime.** Skills cannot be loaded from the network or installed via CLI commands.
- **No community skill registry (ClawHub).** The ClawHub module and all dynamic skill-loading endpoints have been removed.
- **No skill may be added without a pull request, code review, and explicit merge approval.**

Each skill declares metadata flags (`financial`, `client_facing`, `read_only`) that determine how the gateway handles its output. These flags cannot be overridden at runtime.

## Human-in-the-Loop (HITL) Enforcement

The gateway enforces a mandatory approval queue for certain output types:

- **Financial outputs** (quotes, purchase orders, invoices): must be approved by an operator before execution
- **Client-facing communications** (messages, documents intended for clients): must be approved before dispatch
- **System modifications** (external API writes, file writes outside gateway storage): must be approved

This enforcement happens at the **gateway middleware layer**, not within individual skills. A skill cannot bypass the HITL queue regardless of its implementation.

## Role-Scoped Access

Discord server roles and channel permissions control which staff members can invoke which skills. The gateway validates the sender's Discord role membership before routing any message to a skill. Field workers have no visibility of operator or admin channels.

## PII Minimisation

Before data is sent to the model API, a context scrubber replaces personally identifiable information with reference tokens. The model works with tokens; the local gateway resolves them before acting on output.

## Audit Log

All skill executions — including rejected actions — are written to an append-only audit log. Log entries include: timestamp, requesting user, skill name, proposed action summary, and outcome. This log is not modifiable via any skill and is accessible only to the admin operator.

## Plugin Trust Boundary

Plugins/extensions are loaded **in-process** with the Gateway and are treated as trusted code.

- Plugins can execute with the same OS privileges as the OpenClaw process.
- Runtime helpers (for example `runtime.system.runCommandWithTimeout`) are convenience APIs, not a sandbox boundary.
- Only install plugins you trust, and prefer `plugins.allow` to pin explicit trusted plugin IDs.

## Operational Guidance

### Tool Filesystem Hardening

- `tools.exec.applyPatch.workspaceOnly: true` (recommended): keeps `apply_patch` writes/deletes within the configured workspace directory.
- `tools.fs.workspaceOnly: true` (optional): restricts `read`/`write`/`edit`/`apply_patch` paths to the workspace directory.

### Web Interface Safety

The web interface (Gateway Control UI + HTTP endpoints) is intended for **local use only**.

- Recommended: keep the Gateway **loopback-only** (`127.0.0.1` / `::1`).
  - Config: `gateway.bind="loopback"` (default).
  - CLI: `openclaw gateway run --bind loopback`.
- Do **not** expose it to the public internet. It is not hardened for public exposure.
- If you need remote access, prefer an SSH tunnel or Tailscale serve/funnel, plus strong Gateway auth.

### Runtime Requirements

OpenClaw requires **Node.js 22.12.0 or later** (LTS).

### Docker Security

When running in Docker:

1. The official image runs as a non-root user (`node`) for reduced attack surface
2. Use `--read-only` flag when possible for additional filesystem protection
3. Limit container capabilities with `--cap-drop=ALL`

## Out of Scope

- Public internet exposure
- Using OpenClaw in ways that the docs recommend not to
- Prompt injection attacks
