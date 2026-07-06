// apps/desktop/src/hotkeys/register.ts
// Thin, defensive wrappers around @tauri-apps/plugin-global-shortcut so both
// main.ts (primary invoke + extend chords) and the routine hotkey manager
// (routines/hotkeys.ts) share ONE registration helper. Registration failures
// are non-fatal by design: a chord that won't bind (already claimed, parser
// rejection) just doesn't fire — the app keeps working. Extracted verbatim
// from main.ts; no behavior change.

import {
  register as registerShortcut,
  unregister as unregisterShortcut,
  isRegistered as isShortcutRegistered,
} from "@tauri-apps/plugin-global-shortcut";

/**
 * Register a global shortcut, invoking `handler` on the Pressed edge only.
 * Idempotent: if the accelerator is already registered, treats it as success.
 * Returns false (never throws) when the OS/plugin rejects the accelerator.
 */
export async function safeRegister(
  hotkey: string,
  label: string,
  handler: () => void,
): Promise<boolean> {
  try {
    if (await isShortcutRegistered(hotkey)) {
      // eslint-disable-next-line no-console
      console.log(`[hotkey] ${label} (${hotkey}) already registered`);
      return true;
    }
    await registerShortcut(hotkey, (event) => {
      if (event.state !== "Pressed") return;
      // eslint-disable-next-line no-console
      console.log(`[hotkey] ${label} (${hotkey}) pressed`);
      handler();
    });
    // eslint-disable-next-line no-console
    console.log(`[hotkey] ${label} (${hotkey}) registered`);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[hotkey] failed to register ${label} (${hotkey})`, err);
    return false;
  }
}

/** Unregister a global shortcut if present. Safe to call when not registered. */
export async function safeUnregister(hotkey: string, label: string): Promise<void> {
  try {
    if (await isShortcutRegistered(hotkey)) {
      await unregisterShortcut(hotkey);
      // eslint-disable-next-line no-console
      console.log(`[hotkey] ${label} (${hotkey}) released`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[hotkey] failed to unregister ${label} (${hotkey})`, err);
  }
}
