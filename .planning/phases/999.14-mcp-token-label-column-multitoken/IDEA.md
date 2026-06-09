---
phase: 999.14
title: MCP token label column + multi-token-per-user
status: backlog
filed: 2026-06-09
parent: 999.12
---

# MCP token label column + multi-token-per-user

## The idea

Two small followups to Phase 999.12 that were deliberately deferred to keep
v1 of the personal-context MCP scope tight:

1. **Add a dedicated `label text` column to `integration_tokens`.** v1 of
   999.12 reuses the existing `refresh_token` column to store the
   user-supplied human-readable token name (e.g., "claude.ai web",
   "Claude Code on laptop"). That's a documented shortcut — the column's
   semantic intent is OAuth refresh tokens, not labels, and the reuse will
   bite once a token type *actually* needs both a label and a refresh
   token. One additive migration + a thin code path swap fixes it.

2. **Drop the one-token-per-user constraint for MCP agents.** v1 ships
   with the existing composite PK `(user_id, provider)` on
   `integration_tokens`, which means minting a second `mcp_agent` token
   for the same user overwrites the first. That's fine for one-machine
   solo use, but the moment the user wants separate tokens for
   claude.ai web vs Claude Code vs a future mobile agent (so each can be
   revoked independently), the schema needs a token-id surrogate key and
   the PK needs to relax to `(user_id, provider, id)` or similar.

## Why

- Privacy: independent revocation is the whole point of per-agent tokens.
  v1's overwrite-on-mint UX is acceptable for one user with one consumer,
  but every additional MCP consumer makes the overwrite footgun worse.
- Semantic hygiene: `refresh_token` carrying a human label is the kind of
  shortcut that turns into a confusing comment 18 months later when
  someone tries to add OAuth refresh to a different token type.

## Rough shape

- One additive migration: `ALTER TABLE integration_tokens ADD COLUMN
  label text;` + `ALTER TABLE integration_tokens DROP CONSTRAINT
  integration_tokens_pkey;` + recreate PK with a surrogate `id uuid
  default gen_random_uuid()`.
- Migrate existing `mcp_agent` rows: copy `refresh_token` → `label`,
  null out `refresh_token`.
- Update `/settings/mcp-tokens` Server Actions to write `label` directly
  and to support `n` tokens per user.
- Update `apps/web/app/api/mcp/[...transport]/route.ts` bearer lookup to
  match on `(provider, token_hash)` instead of `(user_id, provider)`.

## Trigger

Surface when:
- The user wants to mint a second MCP agent token (claude.ai web AND
  Claude Code) and notices the overwrite, OR
- Any *other* phase needs to add a new `provider` to `integration_tokens`
  that genuinely needs both a label and a real refresh token.
