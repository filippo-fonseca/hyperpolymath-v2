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

<objective>
Make MCP clients (Claude Desktop, Claude Code, claude.ai) autonomously know to call the personal-context server's `get_current_context` tool during relevant conversations — without the user naming the server each time. Two minimal, portable edits: (1) add a server-level `instructions` string to the `McpServer` handshake in `createPersonalContextServer`, which clients read from the `initialize` response as guidance on when/how to use the server; (2) sharpen the `get_current_context` tool description so it explicitly triggers on planning / prioritization / "what should I do" intents and any question about the user's tasks, projects, classes, captures, or commitments. No new dependencies, no apps/web coupling, TypeScript strict preserved.

Verified during planning:
- SDK is `@modelcontextprotocol/sdk` `^1.29.0`. The `McpServer` constructor is `constructor(serverInfo: Implementation, options?: ServerOptions)`, and `ServerOptions` exposes `instructions?: string` ("Optional instructions describing how to use the server and its features"). So `instructions` is a key on the SECOND positional argument.
- `src/index.ts` contains exactly ONE `new McpServer(...)` call (in `createPersonalContextServer`); there is no second constructor.
- Neither `tests/tools.test.ts` nor `tests/types.test.ts` asserts on the exact tool-description string or on `instructions`. Tests only check `instanceof McpServer`, handler behavior, and Zod schemas. No test assertion update is required.
</objective>

<tasks>

1. **Add `instructions` to the `McpServer` handshake**
   - File: `packages/personal-context-mcp/src/index.ts`
   - In `createPersonalContextServer` (the single `new McpServer(...)` call, ~lines 45-48), pass a second positional `ServerOptions` argument containing an `instructions` string. Keep the existing first arg (`{ name, version }`) unchanged.
   - The `instructions` text must tell the client, in plain prose: this server is the user's personal life-OS context (Hyperpolymath) — areas, projects, classes, tasks, quick captures/ideas, training, habits, and facts. Call `get_current_context` at the START of any substantive conversation about the user's tasks, projects, classes, captures/ideas, priorities, or "what should I work on" planning, BEFORE answering. Treat the returned snapshot as the source of truth about the user's life rather than guessing. The data is read-only and refreshes daily.
   - Keep it a single readable string (string concatenation across lines is fine, matching the existing style in `get-current-context.ts`). Do not add imports — `ServerOptions` is structural; no type import is needed to pass an object literal.

2. **Sharpen the `get_current_context` tool description**
   - File: `packages/personal-context-mcp/src/tools/get-current-context.ts`
   - In `registerGetCurrentContext`, replace the description string passed as the 2nd arg to `server.tool("get_current_context", ...)` (~lines 83-85).
   - New description must explicitly trigger the model on: planning / prioritization intents, "what should I do / work on" and "what's on my plate" questions, and any question about the user's tasks, projects, classes, captures, or commitments. It must instruct the model to call this tool FIRST and base its answer on the real returned data rather than guessing. Preserve the existing factual content: returns the most recent personal-context snapshot for the connected user, and the optional `topics` parameter filters to specific node types.
   - Leave `getCurrentContextParamsShape`, the handler, and all exports untouched.

</tasks>

<verification>
Run from `packages/personal-context-mcp/`:

```bash
# 1. Typecheck (TS strict, no emit)
pnpm --filter @hyperpolymath/personal-context-mcp typecheck
# or: cd packages/personal-context-mcp && npx tsc --noEmit

# 2. Existing vitest suite still green (no assertions pinned the changed strings)
pnpm --filter @hyperpolymath/personal-context-mcp test
# or: cd packages/personal-context-mcp && npx vitest run

# 3. Confirm the new text is present
grep -n "instructions" src/index.ts
grep -n "what should I work on\|what's on my plate\|priorit" src/index.ts src/tools/get-current-context.ts
```

Pass criteria: `tsc --noEmit` exits 0; all existing vitest tests pass; grep confirms an `instructions` key in `src/index.ts` and the intent-triggering language in both files. (Behavioral effect — clients reading the handshake — only takes effect after deploy and is out of scope for this quick task's verification.)
</verification>
