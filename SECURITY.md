# Security

## Supported versions

Pre-1.0. Only `main` is supported. Tagged releases will start with v1.0.

## Reporting a vulnerability

Email **filifonsecacagnazzo@gmail.com** with the subject line `[hyperpolymath security]`. Include:

- A description of the issue.
- Reproduction steps. A minimal repro is worth ten paragraphs of theory.
- The commit SHA you tested against.
- Your proposed severity (optional but useful).

You'll get an acknowledgement within 72 hours. Please don't open a public issue or PR for the bug itself until I've had a chance to ship a fix. If you don't hear back in a week, ping again, the email might have been buried.

Single-maintainer project, no bug bounty. Credit in the release notes if you want it.

## In scope

- Anything in `apps/web`, `apps/desktop`, `packages/jarvis-core`, `tools/jarvis-physical`.
- Anything that could leak another user's data, bypass auth, expose API keys, or run code on a deployer's machine.

## Out of scope

- Self-hosted misconfigurations (running with no Supabase RLS in a multi-user deployment, leaked env files in your own repo fork, etc.). See the section below.
- Denial-of-service against a single-tenant deployment caused by burning your own LLM quota. The agent has rate limits; tune them for your usage.
- Social engineering of the maintainer.
- Reports generated entirely by automated scanners without a working repro.

## Known design caveats for self-hosters

The app currently enforces per-user data isolation **in the application layer** by filtering every query on `userId` (the authenticated Supabase user). Postgres-level Row Level Security (RLS) is not yet enabled on most tables.

For a single-user deployment (the intended MVP shape), this is fine. For a multi-user deployment, you should:

1. Treat the application-layer scoping as the only barrier and audit every server action and API route that touches user data.
2. Add RLS policies before exposing the app to anyone you don't personally control.

Tracked under the roadmap as a follow-up before v1.0.

## Cryptography notes

- Google Calendar OAuth tokens are encrypted at rest with AES-256-GCM using `GCAL_TOKEN_ENC_KEY` (32 bytes, base64). Generate one per environment and don't reuse it. Losing the key means every user has to reconnect their calendar; rotating it is not currently supported in-place.
- `PHYSICAL_TRIGGER_SECRET` is a shared secret between the desktop app and the macropad bridge. It only protects the local trigger endpoint, it's not a substitute for app auth.
- All other secrets (Anthropic, Groq, ElevenLabs, Picovoice, Supabase service role, Google OAuth client secret) are server-only. None are exposed via `NEXT_PUBLIC_*`. If you find one that is, that's a bug, please report it.

## Disclosure timeline

Default 90 days from acknowledgement to public disclosure. I'm happy to coordinate a shorter or longer window if there's a reason.
