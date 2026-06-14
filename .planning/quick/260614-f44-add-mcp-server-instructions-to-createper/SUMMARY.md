---
slug: add-mcp-server-instructions-to-createper
quick_id: 260614-f44
date: 2026-06-14
status: complete
branch: main
files_modified:
  - packages/personal-context-mcp/src/index.ts
  - packages/personal-context-mcp/src/tools/get-current-context.ts
---

# Summary — Add MCP server instructions + sharpen get_current_context description

## What changed

- **`packages/personal-context-mcp/src/index.ts`** — Added a second positional `ServerOptions` argument to the single `new McpServer(...)` call in `createPersonalContextServer`, carrying an `instructions` string. The text tells MCP clients this is the user's Hyperpolymath life-OS context (areas, projects, classes, tasks, captures/ideas, training, habits, facts) and to call `get_current_context` at the start of any substantive planning/prioritization conversation before answering, treating the snapshot as source of truth (read-only, refreshes daily). First arg (`{ name, version }`) unchanged; no new imports.
- **`packages/personal-context-mcp/src/tools/get-current-context.ts`** — Replaced the `get_current_context` tool description so it explicitly triggers on planning/prioritization intents, "what should I do / work on" and "what's on my plate" questions, and any question about the user's tasks, projects, classes, captures, or commitments — instructing the model to call FIRST and answer from real data. Preserved factual content (latest snapshot for connected user, optional `topics` filter). Handler, param shape, and exports untouched.

## Verification

- **Typecheck** (`pnpm --filter @hyperpolymath/personal-context-mcp typecheck` -> `tsc --noEmit`): PASS, exit 0.
- **Tests** (`pnpm --filter @hyperpolymath/personal-context-mcp test` -> `vitest run`): PASS — 2 files, 40 tests passed (tests/types.test.ts 25, tests/tools.test.ts 15). No assertion pinned the changed strings, so no test updates required.
- **Grep**: confirmed `instructions` key present in `src/index.ts`; intent-triggering language present in both files.

## Deviations from plan

None — plan executed exactly as written. No fixes were needed; typecheck and tests passed on first run.

## Notes

- Behavioral effect (clients reading the handshake `instructions`) only takes effect after deploy — out of scope for this quick task's verification. Not deployed, not pushed, per instructions.
- Zero-coupling-to-apps/web rule preserved; no new dependencies; TypeScript strict intact.

## Self-Check: PASSED
- packages/personal-context-mcp/src/index.ts — FOUND (instructions on line 51)
- packages/personal-context-mcp/src/tools/get-current-context.ts — FOUND (intent language lines 85-86)
