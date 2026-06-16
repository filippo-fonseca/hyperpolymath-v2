---
slug: morning-dump
mode: quick
issues: [32, 33]
---

# Morning Dump mode

Dedicated daily-planning surface. User dumps free-form stream-of-consciousness
text. Jarvis parses it into a proposed plan (tasks / events / captures) for
REVIEW + EDIT before committing. Nothing auto-commits.

## Seam (reuse, do not modify shared console/undo files)

- NEW route `app/api/jarvis/morning-dump/route.ts` with two modes:
  - `parse`  — dry-run: ask Jarvis (Anthropic client + existing tool defs) to
    propose create_task / create_event / create_capture actions, validate with
    the jarvis-core schemas, return the proposed plan. NO writes.
  - `commit` — execute a client-reviewed action list through the existing
    `createServerExecutor()` (same path as the live console).
- NEW helper `lib/jarvis/morning-dump.ts` — non-streaming parse-to-plan
  (testable, Anthropic mocked).
- NEW UI `components/jarvis/MorningDump.tsx` + page `(app)/morning-dump/page.tsx`
  + nav entry. Journal-paper composer, editable review list, commit button.

## Verify
- `pnpm --filter web typecheck` + `lint` clean for new files.
- New test mocks Anthropic, asserts parse returns validated actions + drops
  invalid ones.
