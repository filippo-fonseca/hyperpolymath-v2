/**
 * Phase 6 Plan 06-03: cross-tree JARVIS input focus dispatch (AES-05, D-02).
 *
 * Architecture (RESEARCH §5): the Cmd+K listener lives at layout level
 * (GlobalHotkeys) but must focus an editor instance deep in the JARVIS
 * Console subtree. A React Context would require lifting state above
 * BOTH the listener and the consumer; a module-level singleton is
 * simpler and has zero React overhead.
 *
 * Lifecycle:
 *   - JarvisInput mounts → registerJarvisFocus(() => editor.commands.focus('end'))
 *   - JarvisInput unmounts → registerJarvisFocus(null)
 *   - GlobalHotkeys captures Cmd+K → calls focusJarvis()
 *     - Active registration → focus fires
 *     - No registration (e.g., user is on a route where Console isn't mounted) → no-op
 *
 * NOTE: There is only ever ONE JARVIS Console mounted at a time
 * (Console is the homescreen at /, not rendered on /tasks etc). Multiple
 * registrations would overwrite each other — that's the desired behavior;
 * latest wins.
 *
 * --- Console mount signal ---
 *
 * JarvisConsole registers itself as mounted so that GlobalJarvisHandler (the
 * voice-transcript fallback for non-/today routes) can detect the side panel
 * is active and yield to JarvisConsole rather than running a second turn.
 * Used specifically for the split-screen + Cmd+K dialog scenario: the dialog
 * fires jarvis-voice-transcript from a non-/today pathname, which would
 * otherwise cause both GlobalJarvisHandler AND JarvisConsole to submit.
 *
 * Lifecycle:
 *   - JarvisConsole mounts → registerJarvisConsoleMounted(true)
 *   - JarvisConsole unmounts → registerJarvisConsoleMounted(false)
 *   - GlobalJarvisHandler.handleVoiceTranscript → checks isJarvisConsoleMounted()
 *     and skips if true (JarvisConsole owns the pipeline when present).
 */
type FocusFn = () => void;

let _focusFn: FocusFn | null = null;
let _consoleMounted = false;

export function registerJarvisFocus(fn: FocusFn | null): void {
  _focusFn = fn;
}

export function focusJarvis(): void {
  _focusFn?.();
}

export function registerJarvisConsoleMounted(mounted: boolean): void {
  _consoleMounted = mounted;
}

export function isJarvisConsoleMounted(): boolean {
  return _consoleMounted;
}
