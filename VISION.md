## Fork Vision

This is a purpose-built fork of [OpenClaw](https://github.com/openclaw/openclaw), adapted to serve as an AI automation assistant for trade business operations.

### Purpose

Small trade businesses carry a significant administrative burden relative to their team size. This fork takes OpenClaw's self-hosted gateway architecture and tailors it to assist with:

- Client communication triage and draft responses
- Job note capture via voice and text
- Field report submission and summarisation
- Quote preparation and review

The system enforces strict human approval for any action involving financial commitment or client-facing output. No autonomous decisions cross these boundaries.

### Architecture Principles

- **Self-hosted gateway** on dedicated hardware. Client data stays on-premises except for model inference calls.
- **Closed skill registry**. No community plugins, no dynamic loading. All skills are committed to version control, reviewed, and deployed through a controlled pipeline.
- **Human-in-the-Loop (HITL) enforcement** at the gateway middleware layer. Financial and client-facing outputs route to an approval queue. This is not optional and cannot be bypassed by individual skills.
- **Role-scoped Discord channels**. Discord's native server roles and channel permissions control which staff members can access which skills. The gateway validates sender roles before invoking any skill.
- **PII minimisation**. Client data is replaced with reference tokens before being sent to the model API.
- **Audit logging**. All skill executions and approval decisions are written to an append-only log.

### What's In Scope

- Trade business workflows: job notes, field reports, quotes, client inquiry triage
- Voice-to-text transcription for field workers
- Structured approval queues for financial and client-facing outputs
- Self-hosted deployment on dedicated hardware (mini PC or equivalent)
- Discord as the primary staff interface

### What's Out of Scope

- General-purpose personal assistant features
- Community skill marketplace (ClawHub)
- Public-facing chatbot or customer service automation
- Direct financial transaction execution (invoicing, payments)
- Social media or content publishing (without HITL gate)

### Relationship to Upstream

This fork is based on OpenClaw (MIT licensed). It is intentionally divergent — the ClawHub skill registry has been removed, dynamic skill loading has been disabled, and the permission model has been adapted for business use. Security patches from upstream may be cherry-picked selectively after review, but the fork does not track upstream `main`.
