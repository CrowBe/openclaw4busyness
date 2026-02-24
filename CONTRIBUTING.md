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

- **Shadow** - Discord subsystem, Discord admin, Clawhub, all community moderation
  - GitHub: [@thewilloftheshadow](https://github.com/thewilloftheshadow) · X: [@4shad0wed](https://x.com/4shad0wed)

- **Vignesh** - Memory (QMD), formal modeling, TUI, IRC, and Lobster
  - GitHub: [@vignesh07](https://github.com/vignesh07) · X: [@\_vgnsh](https://x.com/_vgnsh)

- **Jos** - Telegram, API, Nix mode
  - GitHub: [@joshp123](https://github.com/joshp123) · X: [@jjpcodes](https://x.com/jjpcodes)

- **Ayaan Zaidi** - Telegram subsystem, iOS app
  - GitHub: [@obviyus](https://github.com/obviyus) · X: [@0bviyus](https://x.com/0bviyus)

- **Tyler Yust** - Agents/subagents, cron, BlueBubbles, macOS app
  - GitHub: [@tyler6204](https://github.com/tyler6204) · X: [@tyleryust](https://x.com/tyleryust)

- **Mariano Belinky** - iOS app, Security
  - GitHub: [@mbelinky](https://github.com/mbelinky) · X: [@belimad](https://x.com/belimad)

- **Vincent Koc** - Agents, Telemetry, Hooks, Security
  - GitHub: [@vincentkoc](https://github.com/vincentkoc) · X: [@vincent_koc](https://x.com/vincent_koc)

- **Val Alexander** - UI/UX, Docs, and Agent DevX
  - GitHub: [@BunsDev](https://github.com/BunsDev) · X: [@BunsDev](https://x.com/BunsDev)

- **Seb Slight** - Docs, Agent Reliability, Runtime Hardening
  - GitHub: [@sebslight](https://github.com/sebslight) · X: [@sebslig](https://x.com/sebslig)

- **Christoph Nakazawa** - JS Infra
  - GitHub: [@cpojer](https://github.com/cpojer) · X: [@cnakazawa](https://x.com/cnakazawa)

- **Gustavo Madeira Santana** - Multi-agents, CLI, web UI
  - GitHub: [@gumadeiras](https://github.com/gumadeiras) · X: [@gumadeiras](https://x.com/gumadeiras)

- **Onur Solmaz** - Agents, dev workflows, ACP integrations, MS Teams
  - GitHub: [@onutc](https://github.com/onutc), [@osolmaz](https://github.com/osolmaz) · X: [@onusoz](https://x.com/onusoz)

## How to Contribute

1. **Bugs & small fixes** → Open a PR!
2. **New features / architecture** → Start a [GitHub Discussion](https://github.com/openclaw/openclaw/discussions) or ask in Discord first
3. **Questions** → Discord [#help](https://discord.com/channels/1456350064065904867/1459642797895319552) / [#users-helping-users](https://discord.com/channels/1456350064065904867/1459007081603403828)

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
