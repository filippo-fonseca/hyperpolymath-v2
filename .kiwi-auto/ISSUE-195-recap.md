# Issue #195 recap — UPDATE CRUD receipt readability

**Status:** shipped on branch `kiwi/auto/2026-07-05-issue-195` (not pushed).

## Problem
`JarvisReceipt.tsx` rendered each entry of `receipt.changes` as `String(value)`. Since executors set `set.updatedAt = new Date()` on every update, the receipt showed raw output like `Sun Jul 05 2026 15:30:00 GMT-0400`, and ISO strings for `dueDate` / `start` / `end` came through as machine timestamps. No `before → after` was shown either, even though the executor emits `before` snapshots.

## Change (single file: `apps/web/components/jarvis/JarvisReceipt.tsx`)
1. `fmtDate` now accepts `Date` objects and gcal `{dateTime, date}` envelopes in addition to ISO strings; formats in the user's local timezone.
2. Same-day renders as **"Today at 3:45 PM"**, next-day as **"Tomorrow at 3:45 PM"**, else `MMM D, h:mm a`.
3. New `isTimestampValue` + `fmtChangeValue` helpers route timestamp-typed change values (updatedAt, createdAt, due, dueDate, start, end, startDate, endDate, scheduledAt, completedAt) through `fmtDate`. Booleans render as yes/no. Objects (gcal envelopes) unwrap.
4. `updatedAt` is hoisted out of the visible diff into a small footer: **"Updated today at 3:45 PM"**. It's implementation churn, not user-visible intent.
5. Field labels prettified via `prettifyFieldName` (`camelCase` / `snake_case` → sentence case, e.g. `dueDate` → "Due date").
6. When `receipt.before[field]` exists, the previous value is shown with `line-through` before the `→` so the diff reads as a diff.

## Acceptance check
- Timestamps use `toLocaleTimeString(undefined, …)` / `toLocaleDateString(undefined, …)` → user's local timezone. ✅
- All UPDATE ops share one code path (`action.name.startsWith("update_")`), so this applies to `update_task`, `update_capture`, `update_event` uniformly. ✅
- CREATE / DELETE / READ receipt render branches untouched. ✅

## Verification
- `pnpm --filter web exec tsc --noEmit` — no new errors in the touched file (pre-existing test-file errors unrelated).
- `pnpm --filter web exec vitest run tests/receipt-summary.test.ts tests/strip-receipts-pill.test.ts` — 10/10 pass.

## Not done
- No new unit test for `fmtChangeValue` / `prettifyFieldName` — they're inline helpers inside the component. If we want them tested, extract to `lib/jarvis/receipt-format.ts` in a follow-up.
- No visual verification (headless — no dev-server browser check).
