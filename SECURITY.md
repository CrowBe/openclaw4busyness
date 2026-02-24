# Security Policy

This is a purpose-built fork of [OpenClaw](https://github.com/openclaw/openclaw), adapted for trade business automation. The security model has been tightened for business use.

## Reporting

If you believe you've found a security issue in this fork, please report it via [GitHub private vulnerability reporting](https://github.com/CrowBe/openclaw4busyness/security/advisories/new) on this repository.

For issues in the upstream OpenClaw project, report directly to the relevant repo:

- **Core CLI and gateway** — [openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Trust and threat model** — [openclaw/trust](https://github.com/openclaw/trust)

### Required in Reports

1. **Title**
2. **Severity Assessment**
3. **Impact**
4. **Affected Component**
5. **Technical Reproduction**
6. **Demonstrated Impact**
7. **Environment**
8. **Remediation Advice**

## Closed Skill Policy

### Report Acceptance Gate (Triage Fast Path)

For fastest triage, include all of the following:

- Exact vulnerable path (`file`, function, and line range) on a current revision.
- Tested version details (commit SHA).
- Reproducible PoC against latest `main`.
- Demonstrated impact tied to this fork's documented trust boundaries.
- Scope check explaining why the report is **not** covered by the Out of Scope section below.

Reports that miss these requirements may be closed as `invalid` or `no-action`.

### Duplicate Report Handling

- Search existing advisories before filing.
- Include likely duplicate GHSA IDs in your report when applicable.

## Closed Skill Policy

This fork enforces a closed skill registry. Skills are only loaded from the local /skills directory committed to this repository. The following are prohibited:

- **No dynamic skill installation at runtime.** The `skills.install` gateway method has been permanently disabled and removed. Skills cannot be fetched from the network or installed via remote commands.
- **No community skill registry (ClawHub).** The ClawHub remote skill registry and all associated dynamic skill-loading endpoints have been removed from this fork.
- **No skill may be added without a pull request, code review, and explicit merge approval.** All skills must be reviewed by a maintainer before they are deployed.

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

## Operator Trust Model

This fork inherits OpenClaw's single-operator trust model. The gateway does **not** model one instance as a multi-tenant, adversarial user boundary.

- Authenticated Gateway callers are treated as trusted operators for that gateway instance.
- Session identifiers (`sessionKey`, session IDs, labels) are routing controls, not per-user authorization boundaries.
- Recommended mode: one host/VM per trust boundary, one gateway per user.

## Out of Scope

- Public Internet Exposure
- Using OpenClaw in ways that the docs recommend not to
- Deployments where mutually untrusted/adversarial operators share one gateway host and config (for example, reports expecting per-operator isolation for `sessions.list`, `sessions.preview`, `chat.history`, or similar control-plane reads)
- Prompt-injection-only attacks (without a policy/auth/sandbox boundary bypass)
- Reports that require write access to trusted local state (`~/.openclaw`, workspace files like `MEMORY.md` / `memory/*.md`)
- Reports where the only demonstrated impact is an already-authorized sender intentionally invoking a local-action command (for example `/export-session` writing to an absolute host path) without bypassing auth, sandbox, or another documented boundary
- Any report whose only claim is that an operator-enabled `dangerous*`/`dangerously*` config option weakens defaults (these are explicit break-glass tradeoffs by design)
- Reports that depend on trusted operator-supplied configuration values to trigger availability impact (for example custom regex patterns). These may still be fixed as defense-in-depth hardening, but are not security-boundary bypasses.
- Exposed secrets that are third-party/user-controlled credentials (not OpenClaw-owned and not granting access to OpenClaw-operated infrastructure/services) without demonstrated OpenClaw impact
- Reports whose only claim is host-side exec when sandbox runtime is disabled/unavailable (documented default behavior in the trusted-operator model), without a boundary bypass.

## Deployment Assumptions

OpenClaw security guidance assumes:

- The host where OpenClaw runs is within a trusted OS/admin boundary.
- Anyone who can modify `~/.openclaw` state/config (including `openclaw.json`) is effectively a trusted operator.
- A single Gateway shared by mutually untrusted people is **not a recommended setup**. Use separate gateways (or at minimum separate OS users/hosts) per trust boundary.
- Authenticated Gateway callers are treated as trusted operators. Session identifiers (for example `sessionKey`) are routing controls, not per-user authorization boundaries.
- Multiple gateway instances can run on one machine, but the recommended model is clean per-user isolation (prefer one host/VPS per user).

## One-User Trust Model (Personal Assistant)

OpenClaw's security model is "personal assistant" (one trusted operator, potentially many agents), not "shared multi-tenant bus."

- If multiple people can message the same tool-enabled agent (for example a shared Slack workspace), they can all steer that agent within its granted permissions.
- Session or memory scoping reduces context bleed, but does **not** create per-user host authorization boundaries.
- For mixed-trust or adversarial users, isolate by OS user/host/gateway and use separate credentials per boundary.
- A company-shared agent can be a valid setup when users are in the same trust boundary and the agent is strictly business-only.
- For company-shared setups, use a dedicated machine/VM/container and dedicated accounts; avoid mixing personal data on that runtime.
- If that host/browser profile is logged into personal accounts (for example Apple/Google/personal password manager), you have collapsed the boundary and increased personal-data exposure risk.

## Agent and Model Assumptions

- The model/agent is **not** a trusted principal. Assume prompt/content injection can manipulate behavior.
- Security boundaries come from host/config trust, auth, tool policy, sandboxing, and exec approvals.
- Prompt injection by itself is not a vulnerability report unless it crosses one of those boundaries.

## Gateway and Node trust concept

OpenClaw separates routing from execution, but both remain inside the same operator trust boundary:

- **Gateway** is the control plane. If a caller passes Gateway auth, they are treated as a trusted operator for that Gateway.
- **Node** is an execution extension of the Gateway. Pairing a node grants operator-level remote capability on that node.
- **Exec approvals** (allowlist/ask UI) are operator guardrails to reduce accidental command execution, not a multi-tenant authorization boundary.
- For untrusted-user isolation, split by trust boundary: separate gateways and separate OS users/hosts per boundary.

## Workspace Memory Trust Boundary

`MEMORY.md` and `memory/*.md` are plain workspace files and are treated as trusted local operator state.

- If someone can edit workspace memory files, they already crossed the trusted operator boundary.
- Memory search indexing/recall over those files is expected behavior, not a sandbox/security boundary.
- Example report pattern considered out of scope: "attacker writes malicious content into `memory/*.md`, then `memory_search` returns it."
- If you need isolation between mutually untrusted users, split by OS user or host and run separate gateways.

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
- `gateway.controlUi.dangerouslyDisableDeviceAuth` is intended for localhost-only break-glass use.
  - OpenClaw keeps deployment flexibility by design and does not hard-forbid non-local setups.
  - Non-local and other risky configurations are surfaced by `openclaw security audit` as dangerous findings.
  - This operator-selected tradeoff is by design and not, by itself, a security vulnerability.
- Canvas host note: network-visible canvas is **intentional** for trusted node scenarios (LAN/tailnet).
  - Expected setup: non-loopback bind + Gateway auth (token/password/trusted-proxy) + firewall/tailnet controls.
  - Expected routes: `/__openclaw__/canvas/`, `/__openclaw__/a2ui/`.
  - This deployment model alone is not a security vulnerability.
- Do **not** expose it to the public internet (no direct bind to `0.0.0.0`, no public reverse proxy). It is not hardened for public exposure.
- If you need remote access, prefer an SSH tunnel or Tailscale serve/funnel (so the Gateway still binds to loopback), plus strong Gateway auth.
- The Gateway HTTP surface includes the canvas host (`/__openclaw__/canvas/`, `/__openclaw__/a2ui/`). Treat canvas content as sensitive/untrusted and avoid exposing it beyond loopback unless you understand the risk.

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
