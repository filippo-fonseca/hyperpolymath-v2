// apps/desktop/src/routines/hotkeys.ts
// Per-routine global-shortcut manager. Given the desired (accelerator →
// routineId) set from the registry, it diffs against what's currently
// registered and registers the additions / unregisters the removals, so the
// live hotkey surface always matches the enabled routines (edited in the web
// app). Reserved chords (the primary invoke ⌘⌃J and the extend candidates)
// are refused so a routine can never steal the main invocation surface.

import { safeRegister, safeUnregister } from "@/hotkeys/register";
import { fireRoutine, type HotkeyEntry } from "@/routines/registry";

// Reserved accelerators a routine must NOT bind — mirrors main.ts. Kept in
// sync manually; the cost of drift is only that a routine requesting one of
// these is skipped (logged), never a broken primary hotkey.
const RESERVED = new Set<string>([
  "Command+Control+KeyJ", // primary invoke (WAKE_HOTKEY)
  "Command+Control+KeyE",
  "Command+Control+KeyK",
  "Command+Control+Semicolon",
  "Command+Control+Backslash",
  "Command+Control+Period",
]);

// accelerator → routineId currently registered by THIS manager.
const registered = new Map<string, string>();

// Serialize syncs: register/unregister are async and a burst of refreshes
// (boot + poll landing together) must not interleave into a half-diffed state.
let syncing: Promise<void> = Promise.resolve();

/**
 * Reconcile the registered routine hotkeys with the desired set. Idempotent:
 * safe to call on every refreshRoutines(). Registration failures are non-fatal
 * (safeRegister returns false) — the routine just won't fire by hotkey.
 */
export function syncHotkeys(entries: HotkeyEntry[]): void {
  syncing = syncing.then(() => reconcile(entries));
}

async function reconcile(entries: HotkeyEntry[]): Promise<void> {
  // Desired map (last-wins on a duplicate accelerator; skip reserved chords).
  const desired = new Map<string, string>();
  for (const { accelerator, routineId } of entries) {
    if (RESERVED.has(accelerator)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[routines] hotkey ${accelerator} for ${routineId} is reserved — skipped`,
      );
      continue;
    }
    desired.set(accelerator, routineId);
  }

  // Unregister accelerators no longer desired, or whose routine changed.
  for (const [accel, routineId] of [...registered.entries()]) {
    if (desired.get(accel) !== routineId) {
      await safeUnregister(accel, `routine:${routineId}`);
      registered.delete(accel);
    }
  }

  // Register newly desired accelerators.
  for (const [accel, routineId] of desired.entries()) {
    if (registered.has(accel)) continue;
    const ok = await safeRegister(accel, `routine:${routineId}`, () => {
      void fireRoutine(routineId, "hotkey");
    });
    if (ok) registered.set(accel, routineId);
  }
}
