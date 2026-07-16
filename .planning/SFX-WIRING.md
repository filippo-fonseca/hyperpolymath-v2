# SFX core-pack wiring — unit-orb-sfx

The space-console core pack ships in `apps/web/lib/ui/sfx.ts` with eight named
cues. This unit wired only the ONE call-site inside its fence (sidebar
collapse/expand). The remaining cues are exported and ready; the Conductor
should route each one-liner into the owning unit's call-site.

Import: `import { sfx } from "@/lib/ui/sfx";`
Fire: `sfx.play("<cueName>");` — a single line, no await, never throws, silent
when muted / when the shared AudioContext is still gesture-locked.

| Cue | Fire when | Suggested owner / call-site |
|-----|-----------|------------------------------|
| `sidebarCollapse` / `sidebarExpand` | ✅ DONE — `components/shell/Sidebar.tsx` `toggleCollapsed()` | this unit |
| `viewToggle` | LifeOS view / segmented-tab switch | unit-lifeos-* — the LifeOS tab/view toggle handler. NOTE: an existing `playPop()` chime already fires on some tab switches; pick ONE (prefer `sfx.play("viewToggle")` for the coherent family, and drop the `playPop` call there) to avoid doubling. |
| `taskComplete` | a task is checked/completed | tasks unit — the optimistic "complete task" mutation handler |
| `captureSent` | a capture / message is dispatched | captures + Cmd+K composer. NOTE: `playSend()` already fires here; choose one. |
| `habitCheck` | a habit is checked off | habits/routines unit — the habit-toggle handler |
| `dialogOpen` | a dialog/modal opens | shared Dialog primitive `onOpenChange(true)` (unit-primitives), or per-dialog open handlers |
| `error` | a destructive/failed action surfaces an error toast | shared toast/error path |

## Mute / settings toggle
- `ui:sfx` localStorage key, default ON. API: `sfx.enabled` (getter),
  `sfx.setEnabled(boolean)` — also `isSfxEnabled` / `setSfxEnabled` named exports.
- The core pack ALSO short-circuits on the existing master mute
  (`isSfxMuted()` / `hp:sfx-muted` in `lib/ui/sound-prefs.ts`), so the current
  sidebar mute already silences these cues. A settings unit can wire a separate
  "subtle UI sounds" switch to `sfx.setEnabled`.

## Constraints honored
- Every cue < 180ms, quiet (peak gain 0.07 vs 0.35-0.4 chimes), pitch-coherent
  (all intervals of C5), per-cue throttled (no stacking), silent when the
  AudioContext is locked. Verified by `apps/web/tests/sfx-core-pack.test.ts`.
