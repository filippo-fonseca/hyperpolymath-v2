# Phase 33: JARVIS ⌘K Reliability — Research

**Researched:** 2026-06-29
**Domain:** JARVIS SSE stream lifecycle, React component state, navigation abort
**Confidence:** HIGH (all findings from direct codebase reads — no assumptions)
**Issue:** #172 — cmd+K JARVIS messages abort on navigation, no undo, no retry

---

## 1. Full ⌘K → JARVIS Flow Diagram

```
User presses ⌘K (not on /today)
         │
         ▼
GlobalJarvisDialog (app layout, always mounted)
  • KeyboardEvent listener intercepts Cmd+K
  • Skips if pathname starts with /today
  • Sets open=true → renders Dialog with LiteJarvisComposer
         │
         ▼ (user types message, presses ⌘⏎)
LiteJarvisComposer.handleKeyDown
  • Calls onSubmit(trimmed) → GlobalJarvisDialog.handleSubmit(text)
         │
         ▼
GlobalJarvisDialog.handleSubmit (line 77-84)
  1. setOpen(false) — CLOSES THE DIALOG
  2. window.dispatchEvent(new CustomEvent("jarvis-voice-transcript", {
       detail: { transcript: text }     ← no source, no sttDoneAt
     }))
         │
         ▼ (event dispatched to window)
         │
         ├── Path A: JarvisConsole is mounted (split-screen /today in side panel)
         │     isJarvisConsoleMounted() → true
         │     GlobalJarvisHandler skips (line 120)
         │     JarvisConsole.handleVoiceTranscript picks it up (line 843)
         │     → Full streaming turn runs inside JarvisConsole (no navigation)
         │     → THIS PATH WORKS CORRECTLY
         │
         └── Path B: JarvisConsole NOT mounted (user on /tasks, /captures, etc.)
               GlobalJarvisHandler.handleVoiceTranscript fires (line 95)
               → Creates AbortController (local to useEffect closure, line 93)
               → Calls streamJarvis(..., abort.signal)   [fetch + SSE read loop]
               → Fetch is in-flight
               │
               ▼ (user OR Next.js router triggers navigation, e.g. to /today)
               PROBLEM: isConsolePage changes from false → true
                        React re-runs the useEffect because [isConsolePage] changed
                        The previous effect's CLEANUP RUNS:
                           abort?.abort()     ← line 391
                        This aborts the in-flight fetch
                        streamJarvis catches AbortError → calls onError("aborted")
                        onError("aborted") silently suppresses the toast (line 333)
                        The turn is partially persisted (user turn saved, assistant
                        turn saved with status="error")
```

---

## 2. Root Cause: Exact File and Line Reference

**File:** `apps/web/components/jarvis/GlobalJarvisHandler.tsx`

The abort happens in the `useEffect` cleanup function at **line 391**:

```typescript
return () => {
  window.removeEventListener("jarvis-voice-transcript", handleVoiceTranscript);
  window.removeEventListener("jarvis-cancel", handleCancel);
  window.removeEventListener("jarvis-tool-call", handleDesktopToolCall);
  abort?.abort();    // ← LINE 391: kills the in-flight fetch
};
```

The effect dependency array is `[isConsolePage, queryClient, userId]` (line 393). `isConsolePage` is derived as:

```typescript
const isConsolePage = pathname === "/today";    // line 88
```

When the user navigates to `/today` (a natural thing to do after asking JARVIS something), `pathname` changes, `isConsolePage` flips from `false` to `true`, React re-runs the effect, and the cleanup executes `abort?.abort()`, killing the in-flight fetch.

**Secondary trigger:** Even without the user navigating, if they navigate to any other route while on a non-/today route, `isConsolePage` stays false but the `pathname` changes don't re-run the effect — HOWEVER, when they later land on `/today`, the flip happens and kills the request.

**There is also a second abort vector at line 155 in `jarvis-stream-client.ts`:**

```typescript
const onCallerAbort = () => timeoutController.abort();
if (signal) {
  if (signal.aborted) timeoutController.abort();
  else signal.addEventListener("abort", onCallerAbort, { once: true });
}
```

The `AbortController` created at line 93 of `GlobalJarvisHandler` is passed as the `signal` here. When the cleanup aborts it, this chain fires and the fetch is cancelled server-side too (the route's `req.signal` also fires, propagating to the Anthropic upstream at `apps/web/app/api/jarvis/route.ts` line 224-225).

---

## 3. State Management Inventory

### Where JARVIS turn state lives today

| State | Location | Lifecycle |
|-------|----------|-----------|
| `turns` (scrollback) | `useState` inside `JarvisConsole` (line 187) | Destroyed when `/today` unmounts |
| `streaming` flag | `useState` inside `JarvisConsole` (line 193) | Same as above |
| `abortRef` | `useRef` inside `JarvisConsole` (line 194) | Same as above |
| GlobalJarvisHandler's `abort` | local `let` inside `useEffect` closure (line 93) | Destroyed when effect cleanup runs |
| `_consoleMounted` | module-level singleton in `lib/jarvis/focus.ts` (line 40) | Process lifetime (persists nav) |
| `_focusFn` | module-level singleton in `lib/jarvis/focus.ts` (line 39) | Process lifetime |
| `unreadCount` | module-level in `lib/jarvis/unread-bus.ts` (line 27) | Process lifetime |
| Persisted turns | `jarvis_turns` Supabase table | Durable (survives reload) |
| `jarvis-prefill` | `sessionStorage` key | Tab session (survives SPA nav) |

### Key insight: there is NO cross-navigation JARVIS state

All streaming state (the SSE reader loop, the `AbortController`, the in-memory turn being built) lives inside either:
1. `JarvisConsole` component state — destroyed on unmount
2. The `GlobalJarvisHandler` `useEffect` closure — destroyed when the effect re-runs due to `isConsolePage` change

Neither TanStack Query, Zustand, nor any React Context wraps the streaming state. The `jarvis_turns` table is the only durable store, and the assistant turn is only written there on `onDone` or `onError` — not incrementally during streaming.

---

## 4. The 5s Undo Implementation

**Location:** `apps/web/components/jarvis/use-undo-countdown.ts`

The `useUndoCountdown(initialSeconds, onExpire)` hook counts down once per second via `setInterval`. It fires `onExpire` when seconds reaches 0, or allows `cancel()` to stop it early.

**Where it's consumed:** `apps/web/components/jarvis/JarvisReceipt.tsx`

The receipt card mounts `useUndoCountdown(5, onExpire)` when `action.status === "done" && !action.undone`. While `seconds > 0`, it renders an "Undo (N)" button. The button calls `onUndo()` which bubbles up to `JarvisConsole.handleUndoAction`.

**The handler:** `JarvisConsole.handleUndoAction` (line 1017) calls `undoJarvisAction` server action (`app/actions/jarvis.ts` line 135), which proxies to `lib/jarvis/undo.ts`.

**Critical gap for cmd+K turns:** The undo countdown is a component-level hook inside `JarvisReceipt`. For undo to work, the action receipt must be rendered inside a mounted `JarvisConsole`. When a cmd+K turn is processed by `GlobalJarvisHandler`, the action receipts are shown only as Sonner toasts (line 266-270 of `GlobalJarvisHandler`). There is no `JarvisReceipt` component, no `useUndoCountdown`, and therefore no Undo button. This is the second part of issue #172.

---

## 5. The `/api/jarvis` Route and Server-Side Abort

**File:** `apps/web/app/api/jarvis/route.ts`

The route creates an `upstream` AbortController and wires it to `req.signal`:

```typescript
// line 223-225
const upstream = new AbortController();
const onAbort = () => upstream.abort();
req.signal.addEventListener("abort", onAbort, { once: true });
```

`upstream.signal` is passed to `runJarvisTurnStream` as `abortSignal`, which propagates it to the Anthropic API call. When the client disconnects (navigation triggers client fetch abort), `req.signal` fires, `upstream.abort()` fires, and the Anthropic stream is cancelled server-side. **The tool executor has already run** for any tool calls that completed before the abort, so database rows may already exist from partial runs.

The `ReadableStream.cancel()` callback at line 292 also calls `upstream.abort()` as a second guard.

---

## 6. Scenario Mapping: What Exactly Breaks When

| Scenario | What happens | Result |
|----------|-------------|--------|
| User on `/tasks`, ⌘K → types → ⌘⏎, stays on `/tasks` | `GlobalJarvisHandler` picks up `jarvis-voice-transcript`. Fetch runs. No navigation. | WORKS (no abort) |
| User on `/tasks`, ⌘K → types → ⌘⏎, clicks JARVIS tab | Nav to `/today` flips `isConsolePage`. Effect cleanup aborts fetch. | BROKEN (abort mid-stream) |
| User on `/tasks`, ⌘K → types → ⌘⏎, clicks any other tab | `isConsolePage` stays false. Effect re-runs because `pathname` changed (wait — `pathname` IS in scope via closure, but it's NOT in the dep array). Effect does NOT re-run on arbitrary nav. | MOSTLY WORKS (only breaks on nav to /today) |
| User on `/tasks`, ⌘K → types → ⌘⏎, stays until done, navigates to `/today` | Turn completes. `abort = null` on done. Effect cleanup runs but `abort` is null. JarvisConsole Realtime subscription merges completed turn. | WORKS |
| Split-screen with JarvisConsole visible | `isJarvisConsoleMounted()` is true. `GlobalJarvisHandler` yields. `JarvisConsole` handles the event directly. | WORKS |

**Summary: The bug is specific to navigation to `/today` while a cmd+K turn is in-flight through `GlobalJarvisHandler`.**

---

## 7. Recommended Fix Approach

### Recommendation: Option A-lite — Decouple the abort from the isConsolePage flip

The root cause is a single line: `abort?.abort()` in the effect cleanup, which fires when `isConsolePage` changes. The fix does not require a full React Context lift or BroadcastChannel.

**The minimal correct fix (two parts):**

#### Part 1: Remove `isConsolePage` from the effect dependency array

Change `GlobalJarvisHandler.tsx` so that the `useEffect` that manages the event listeners (and holds the `abort` reference) does NOT re-run when `isConsolePage` changes. Instead, gate the `handleVoiceTranscript` callback dynamically by reading `isConsolePage` at call time via a ref:

```typescript
// Add a ref that always reflects the current value
const isConsolePageRef = useRef(isConsolePage);
isConsolePageRef.current = isConsolePage;

useEffect(() => {
  // ...
  function handleVoiceTranscript(e: Event) {
    // Guard: yield to JarvisConsole if now on /today
    if (isConsolePageRef.current) return;
    if (isJarvisConsoleMounted()) return;
    // ... rest of handler unchanged
  }
  // ...
  return () => {
    window.removeEventListener(...);
    // DO NOT abort here — allow in-flight requests to complete
  };
}, [queryClient, userId]);  // isConsolePage removed from deps
```

This keeps the event listener alive across navigations. The in-flight `abort` lives in the closure and is no longer killed by the effect re-running.

#### Part 2: Hand off the in-flight turn to JarvisConsole on nav-to-/today

When the user navigates to `/today` while a turn is in-flight in `GlobalJarvisHandler`, JarvisConsole mounts and the Supabase Realtime subscription (`jarvis_turns` channel) will pick up the completed turn once `onDone` fires. The user turn was already persisted immediately (line 145 of `GlobalJarvisHandler`). The assistant turn will persist on `onDone` (line 322). JarvisConsole's `mergeById` function will then dedup-merge it into the scrollback.

With Part 1 alone, this "lands in JarvisConsole scrollback automatically via Realtime" path works. No additional wiring is needed for the base case.

#### Part 3 (for the undo gap): Write a sessionStorage handoff instead of a window event

The undo gap exists because `GlobalJarvisHandler` renders receipts as transient toasts, not as `JarvisReceipt` components. The fix for undo is to change `GlobalJarvisDialog.handleSubmit` to use the `sessionStorage` prefill pattern (identical to `LifeOsQuickSend`) instead of the `jarvis-voice-transcript` window event:

```typescript
// GlobalJarvisDialog.tsx — handleSubmit
function handleSubmit(text: string) {
  setOpen(false);
  try {
    sessionStorage.setItem("jarvis-prefill", text);
  } catch {
    // sessionStorage unavailable — fall through
  }
  router.push("/today");
}
```

This routes ALL cmd+K submissions through the full `JarvisConsole` flow, which means:
- The turn streams with thinking indicator in the JARVIS tab
- The receipt card appears with a 5s Undo button (via `JarvisReceipt`)
- No `GlobalJarvisHandler` involvement → no abort risk from navigation
- The `handleUndoAction` path works as normal

The downside: the user MUST navigate to `/today` to see the response. For users who want to "fire and forget" from another tab and see toast receipts, this changes the UX. However, issue #172 explicitly calls out that cmd+K messages should "appear in the JARVIS tab conversation with the standard 5s undo" — which is exactly what this path delivers.

#### Recommended approach: Part 3 (sessionStorage) as the primary fix + Part 1 as a hardening measure

Use Part 3 (sessionStorage + router.push) as the primary dispatch path from `GlobalJarvisDialog`. This is already the established pattern for `LifeOsQuickSend` and exactly matches the expected behavior in issue #172.

Apply Part 1 (remove `isConsolePage` from deps, use ref) as a secondary hardening change so voice transcript turns sent from non-/today routes don't abort either.

---

## 8. Why the Other Options Are Inferior

| Option | Verdict | Reason |
|--------|---------|--------|
| **B: BroadcastChannel / service worker** | Not needed | Overkill for a same-tab SPA. No cross-tab requirement. |
| **C: sessionStorage immediately on submit** | This IS Part 3 | Already used by `LifeOsQuickSend`. The established pattern. |
| **D: Queue via server action** | Not needed | Adds a round-trip and new backend surface. The abort is purely client-side. |
| **A: Full React Context lift** | Possible but heavy | Would require lifting `turns`, `streaming`, and `abortRef` above the router, threading through `(app)/layout.tsx`. The sessionStorage handoff achieves the same result with less architecture change. |

---

## 9. JARVIS Tab Notification on Completion

When a turn completes in `GlobalJarvisHandler` (non-/today route, voice or cmd+K), the following happens:

1. `onDone` fires: `persistTurn(assistant)` writes the completed turn to `jarvis_turns`
2. `bumpUnread()` fires: increments the module-level `unreadCount`, causing the JARVIS tab badge in `TopTabBar` to show a numeric badge (via `JarvisUnreadBadge`, which subscribes to `subscribeToUnread`)
3. When the user navigates to `/today`, `JarvisConsole` mounts, its Supabase Realtime channel fires on the `INSERT/UPDATE` to `jarvis_turns`, and `mergeById` adds the completed turn to the scrollback

So the notification infrastructure already works. The problem is that with the current code, the turn aborts before it can complete, so `persistTurn` never gets a "done" status and `bumpUnread` never fires.

---

## 10. Files That Need to Change

| File | Change | Reason |
|------|--------|--------|
| `apps/web/components/jarvis/GlobalJarvisDialog.tsx` | Replace `window.dispatchEvent(jarvis-voice-transcript)` with `sessionStorage.setItem('jarvis-prefill', text); router.push('/today')` | Routes through JarvisConsole for proper streaming UI + 5s undo |
| `apps/web/components/jarvis/GlobalJarvisHandler.tsx` | Move `isConsolePage` check into a ref read inside the handler; remove from dep array; remove `abort?.abort()` from cleanup | Prevents navigation-triggered abort for voice turns |
| Possibly `apps/web/components/jarvis/JarvisConsole.tsx` | No change required | sessionStorage prefill path already implemented at line 971-992 |

The `today/page.tsx`, the API route, and `jarvis-stream-client.ts` require no changes.

---

## 11. Edge Cases to Handle

| Edge case | Impact | Mitigation |
|-----------|--------|------------|
| User submits from ⌘K but is ALREADY on `/today` | `GlobalJarvisDialog` already guards: `if (pathname?.startsWith("/today")) return` (line 38). Dialog never opens. `GlobalHotkeys.focusJarvis()` fires instead. | No change needed |
| User submits from ⌘K and navigates to `/today`, which is mid-loading | sessionStorage survives the navigation. JarvisConsole's `useEffect` at line 971 fires on mount and reads the prefill. | Works by design |
| User submits from ⌘K while a turn is already streaming in JarvisConsole (split-screen) | With the sessionStorage approach: the `jarvis-prefill` key is written, but the user navigates to `/today` where JarvisConsole is already mounted. The mount `useEffect` fires with `prefill`, but `disabled={streaming}` on `JarvisInput` would block the normal UI. The `handleSubmit` call is not gated by `disabled` — it would queue a second turn while the first streams. This is the same race that the existing `abortRef.current?.abort()` guard at line 529 handles. | Existing guard handles it. |
| `sessionStorage` unavailable (private browsing) | The `try/catch` in `LifeOsQuickSend` is the model — wrap the write. Fall back to a toast warning. | Mirror the existing pattern. |
| Multiple cmd+K submissions in quick succession | Each overwrites `jarvis-prefill`. Only the last survives. JarvisConsole only reads once on mount (and removes the key). The earlier submissions are lost. | Acceptable for MVP — same behavior as LifeOsQuickSend. Could be addressed with a queue but that's scope creep. |
| Network failure mid-stream on `/today` | `onError` fires, `JarvisConsole` renders the error state in scrollback with the standard error receipt. | Already handled by JarvisConsole. |
| Voice transcript fires from a non-/today route while a cmd+K turn is also in-flight | Part 1 fix: both will share the same `GlobalJarvisHandler` effect. The new voice transcript calls `abort?.abort()` on line 125 before starting a new AbortController. This intentionally cancels the previous turn. | Same as current behavior — last-in wins. |

---

## 12. Open Questions

1. **What if the user doesn't want to navigate to `/today`?** The sessionStorage approach always navigates. Issue #172 says messages should "appear in the JARVIS tab conversation," which implies navigation is acceptable. But if "fire and forget with toast receipts from any tab" is the desired behavior, Part 1 alone (removing `isConsolePage` from deps) is the right fix without Part 3. Needs product decision.

2. **Should `/today` be scrolled to show the new turn?** JarvisConsole's `prefill` effect fires with `handleSubmit`, which appends the turn to the bottom. `JarvisScrollback` auto-scrolls on new turns. This should work. Confirm during implementation.

3. **The `history` array for cmd+K turns is empty today.** In `GlobalJarvisDialog.handleSubmit`, the `jarvis-voice-transcript` event carries no history. The `GlobalJarvisHandler` passes `history: []` to `streamJarvis`. With the sessionStorage approach, JarvisConsole uses `buildHistory(turnsRef.current)` — which IS the real conversation history. This is actually an improvement.

---

## Sources

All findings from direct codebase reads (no web search required — this is purely a control-flow trace):

- `apps/web/components/jarvis/GlobalJarvisDialog.tsx` — ⌘K dialog + handleSubmit
- `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — voice transcript handler, abort lifecycle
- `apps/web/components/jarvis/JarvisConsole.tsx` — sessionStorage prefill consumer, streaming state
- `apps/web/components/jarvis/jarvis-stream-client.ts` — fetch + SSE reader, AbortController chaining
- `apps/web/app/api/jarvis/route.ts` — server-side abort propagation
- `apps/web/components/jarvis/use-undo-countdown.ts` — 5s countdown hook
- `apps/web/components/jarvis/JarvisReceipt.tsx` — undo button render
- `apps/web/app/actions/jarvis.ts` — `undoJarvisAction` server action
- `apps/web/lib/jarvis/focus.ts` — `isJarvisConsoleMounted` singleton
- `apps/web/lib/jarvis/unread-bus.ts` — unread badge bus
- `apps/web/components/lifeos/LifeOsQuickSend.tsx` — reference implementation of sessionStorage handoff
- `apps/web/components/shell/GlobalHotkeys.tsx` — Cmd+K binding (delegates to `focusJarvis`)
- `apps/web/app/(app)/layout.tsx` — GlobalJarvisDialog + GlobalJarvisHandler mount point
- `apps/web/app/(app)/today/page.tsx` — JarvisConsole mount, initialTurns hydration

**Confidence:** HIGH — all findings verified by reading actual source files in the session.
