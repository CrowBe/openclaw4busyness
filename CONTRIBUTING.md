# Contributing

This is a purpose-built fork of [OpenClaw](https://github.com/openclaw/openclaw), adapted for trade business automation. It is open source under the MIT license and contributions are welcome, subject to the policies below.

## Closed Skill Policy

This fork enforces a **closed skill registry**. Skills are plain TypeScript modules committed to the `/skills` directory. No dynamic skill loading, no runtime installation, no network fetching.

**Adding or modifying a skill requires:**

1. A pull request with a clear description of the skill's purpose and behaviour
2. Correct metadata declarations (`financial`, `client_facing`, `read_only` flags)
3. Code review and explicit merge approval
4. Passing tests (`pnpm build && pnpm check && pnpm test`)

Skills that produce financial outputs or client-facing communications **must** route through the HITL (Human-in-the-Loop) approval queue. This is enforced at the gateway middleware layer and cannot be bypassed by individual skills.

## Before You PR

- Build and test locally: `pnpm build && pnpm check && pnpm test`
- Keep PRs focused (one change per PR)
- Describe what the change does and why
- If adding a skill, include the metadata object with correct flags

## Security

See [`SECURITY.md`](SECURITY.md) for the security model and reporting process.

## Architecture

See [`docs/internal/BUILD_PLAN.md`](docs/internal/BUILD_PLAN.md) for the build plan and architectural decisions.
See [`docs/internal/INFRASTRUCTURE.md`](docs/internal/INFRASTRUCTURE.md) for the deployment and infrastructure architecture.

## Upstream

This fork is intentionally divergent from upstream OpenClaw. Security patches from upstream may be cherry-picked selectively after review, but the fork does not track upstream `main`.
