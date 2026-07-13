// apps/desktop/src/startup/sequencer.ts
// The configurable session-start sequence. On the FIRST invoke of an app
// session (hotkey / tray / wake), run — in this exact order:
//
//   1. Briefing — the proactive spoken briefing (briefing/briefing.ts). OPT-IN
//      (startupBriefingEnabled defaults to false): an unrequested "Good
//      morning, sir" greeting on every wake reads as the app talking to
//      itself, so this step only fires when the user has explicitly turned it
//      on in settings. When it does run it is AWAITED until its TTS has fully
//      drained — briefing audio and mic capture must NEVER overlap (zero AEC —
//      JARVIS would hear itself).
//   2. openOnStart — configured apps/URLs, all launched in PARALLEL via the
//      existing open_url/open_app dispatcher plumbing.
//   3. shortcuts — configured macOS Shortcuts names, run in PARALLEL with
//      each other AND with step 2 (Rust `run_shortcut`).
//   4. Mic — opened by the conversation FSM after this resolves. When the
//      briefing spoke, the FSM's own continue-window machinery reopens the
//      mic after the drain; when it didn't (disabled / failed / silent), the
//      FSM sees state === "idle" after awaiting maybeRunStartupSequence()
//      and opens the mic itself. Steps 2/3 are fire-and-forget: they never
//      delay the mic beyond being fired off.
//
// The sequence runs ONCE per app session (tracked by the module-level
// _startupRan flag): every later invoke resolves immediately and goes
// straight to the mic. Empty/disabled steps are skipped with a single
// [startup] log line each.
//
// Config lives in settings.ts — startup.briefingEnabled /
// startup.openOnStart / startup.shortcuts — read via loadSettings(), written
// via saveSetting() (that's the surface the settings UI builds on).

import { fetchStartupConfig } from "@/api/client";
import { fireOpenItems, handleAction } from "@/actions/dispatcher";
import { runBriefing } from "@/briefing/briefing";
import { onJarvisResponseComplete, ttsPlayer } from "@/jarvis-response";
import { onJarvisResponseEnd } from "@/physical-extender/sse-client";
import { loadSettings, saveSetting, type StartupOpenItem } from "@/settings";

// After the briefing's response ends, the first TTS sentence fetch may still
// lag the first `playing` transition. Wait this long for audio to begin
// before concluding the briefing produced no speech (TTS off / text-only
// reply). Deliberately longer than the FSM's THINKING_GRACE_MS (600 ms) so
// the FSM makes its own no-audio call first and owns the mic either way.
const NO_AUDIO_GRACE_MS = 900;
// Hard ceiling on how long the sequence will gate on the briefing. Generous:
// the FSM's own safety caps (20 s thinking + 45 s speaking) force-advance
// well inside it, so a stalled backend can never wedge session start —
// steps 2/3 fire and the mic path proceeds regardless.
const BRIEFING_DRAIN_CAP_MS = 75_000;

type DrainOutcome = "drained" | "no-audio" | "timeout" | "cancelled";

// Once-per-session tracking: flipped on the first invoke, never reset.
// (The briefing module itself is stateless — this flag is the single source
// of truth for "the session-start sequence already ran".)
let _startupRan = false;

// Non-null while the briefing's drain-watch is in flight. Lets a barge-in
// (⌘⌃J / trigger while the briefing speaks) cancel the drain without the
// sequencer needing to know about the FSM.
let activeBriefingDrain: { cancel: () => void } | null = null;

/** True once the session-start sequence has begun/run this app session. */
export function hasStartupSequenceRun(): boolean {
  return _startupRan;
}

/**
 * Barge-in: stop the briefing's TTS and release the sequencer's drain-watch so
 * session start stops gating on speech. Safe no-op if no briefing is in flight.
 * Returns true if a briefing was actually skipped.
 */
export function skipStartupBriefing(): boolean {
  if (!activeBriefingDrain) return false;
  ttsPlayer.stop(); // silence + clear the sink/queue
  activeBriefingDrain.cancel(); // resolve drain.done → "cancelled"
  activeBriefingDrain = null;
  return true;
}

/**
 * Watch for the briefing's spoken response to FULLY drain. Subscribes before
 * the briefing POST fires so no signal can be missed. Resolution:
 *   - "drained": the response ended AND TTS (which we saw playing) is idle.
 *   - "no-audio": the response ended and TTS never started within the grace
 *     window (TTS disabled/blocked, or a text-only reply).
 *   - "timeout": the hard cap elapsed (stalled backend / lost stream).
 *   - "cancelled": cancel() was called (the briefing POST failed).
 *
 * Signals: ttsPlayer.onStateChange (the Rust rodio sink's real playback
 * state, which stays "playing" while sentences are queued or fetching) plus
 * BOTH response-end signals — the raw SSE `response-end` and the buffered
 * `response-complete` (fires after the tail sentence is flushed into the TTS
 * queue), mirroring the FSM's own resilience pattern.
 */
function beginBriefingDrainWatch(): { done: Promise<DrainOutcome>; cancel: () => void } {
  let settle: (how: DrainOutcome) => void = () => {};
  const done = new Promise<DrainOutcome>((resolve) => {
    let responseDone = false;
    let sawAudio = ttsPlayer.getState() === "playing";
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanups: Array<() => void> = [];

    const capTimer = setTimeout(() => settle("timeout"), BRIEFING_DRAIN_CAP_MS);

    settle = (how: DrainOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(capTimer);
      if (graceTimer !== null) clearTimeout(graceTimer);
      for (const off of cleanups) off();
      resolve(how);
    };

    const maybeSettle = () => {
      if (settled || !responseDone) return;
      if (ttsPlayer.getState() === "playing") return;
      if (sawAudio) {
        settle("drained");
        return;
      }
      // Response is over but audio never started — arm one grace beat. If TTS
      // begins inside it, the `playing` listener below cancels the timer and
      // we wait for the real drain instead.
      if (graceTimer === null) {
        graceTimer = setTimeout(() => {
          graceTimer = null;
          if (ttsPlayer.getState() === "playing") return; // audio won the race
          settle(sawAudio ? "drained" : "no-audio");
        }, NO_AUDIO_GRACE_MS);
      }
    };

    cleanups.push(
      ttsPlayer.onStateChange((s) => {
        if (s === "playing") {
          sawAudio = true;
          if (graceTimer !== null) {
            clearTimeout(graceTimer);
            graceTimer = null;
          }
        } else {
          maybeSettle();
        }
      }),
    );
    cleanups.push(
      onJarvisResponseEnd(() => {
        responseDone = true;
        maybeSettle();
      }),
    );
    cleanups.push(
      onJarvisResponseComplete(() => {
        responseDone = true;
        maybeSettle();
      }),
    );
  });
  return { done, cancel: () => settle("cancelled") };
}

/** Step 2: open configured apps/URLs — all fired in parallel, never awaited.
 *  Delegates to the shared `fireOpenItems` helper in dispatcher.ts so the
 *  open_workspace action follows the exact same code path. */
function fireOpenOnStart(items: StartupOpenItem[]): void {
  if (items.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[startup] step 2: openOnStart skipped (empty)");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[startup] step 2: opening ${items.length} item(s) in parallel`);
  fireOpenItems(items);
}

/** Step 3: run configured macOS Shortcuts — all fired in parallel, never awaited. */
function fireShortcuts(names: string[]): void {
  if (names.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[startup] step 3: shortcuts skipped (empty)");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[startup] step 3: running ${names.length} shortcut(s) in parallel`);
  for (const name of names) {
    void handleAction({ kind: "run_shortcut", name }).then((ok) => {
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn(`[startup] step 3: shortcut "${name}" failed`);
      }
    });
  }
}

/** The three startup fields the sequence consumes, resolved from whichever
 *  source won (web when reachable, else the local Tauri store). */
interface ResolvedStartupConfig {
  startupBriefingEnabled: boolean;
  startupOpenOnStart: StartupOpenItem[];
  startupShortcuts: string[];
}

/**
 * Resolve the startup config the sequence should execute. WEB IS THE SOURCE OF
 * TRUTH when reachable: fetch the owner's canonical config from
 * /api/jarvis/config/startup (bearer-authed, bounded by its own ~4s timeout so
 * this never blocks session start). On success we mirror it into the local
 * Tauri store — best-effort, non-blocking — so the offline fallback and the
 * local settings UI stay in sync, then run the sequence from the web values.
 * On ANY failure (offline / no token / timeout) we fall back to the existing
 * local `loadSettings()` values so a session start still runs the last-known
 * config.
 */
async function resolveStartupConfig(): Promise<ResolvedStartupConfig> {
  const web = await fetchStartupConfig();
  if (web) {
    // eslint-disable-next-line no-console
    console.log("[startup] config source: web (source of truth) — mirroring to local store");
    // Mirror into the local store so offline still works and the local UI
    // reflects the canonical config. Best-effort: a store write failure must
    // not affect the sequence we're about to run from the web values.
    void Promise.all([
      saveSetting("startupBriefingEnabled", web.briefingEnabled),
      saveSetting("startupOpenOnStart", web.openOnStart),
      saveSetting("startupShortcuts", web.startupShortcuts),
    ]).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[startup] mirror to local store failed", err);
    });
    return {
      startupBriefingEnabled: web.briefingEnabled,
      startupOpenOnStart: web.openOnStart,
      startupShortcuts: web.startupShortcuts,
    };
  }
  // eslint-disable-next-line no-console
  console.log("[startup] config source: local store (web unreachable — offline fallback)");
  const local = await loadSettings();
  return {
    startupBriefingEnabled: local.startupBriefingEnabled,
    startupOpenOnStart: local.startupOpenOnStart,
    startupShortcuts: local.startupShortcuts,
  };
}

/**
 * Run the session-start sequence exactly once per app session. Resolves after
 * the briefing has fully drained and steps 2/3 have been FIRED (not finished);
 * on every later invoke it resolves immediately (straight to mic, no logs).
 *
 * The caller (conversation FSM startConversation) awaits this before opening
 * the mic — that await IS the no-overlap guarantee between briefing audio and
 * mic capture.
 */
export async function maybeRunStartupSequence(): Promise<void> {
  if (_startupRan) return; // later invokes: straight to mic
  _startupRan = true;

  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log("[startup] session-start sequence — first invoke this session");

  const settings = await resolveStartupConfig();

  // ── Step 1: briefing — fully drain before anything may open the mic ──────
  if (!settings.startupBriefingEnabled) {
    // eslint-disable-next-line no-console
    console.log("[startup] step 1: briefing skipped (disabled)");
  } else {
    // eslint-disable-next-line no-console
    console.log("[startup] step 1: briefing — firing");
    // Subscribe BEFORE the POST so no response/TTS signal can be missed.
    const drain = beginBriefingDrainWatch();
    activeBriefingDrain = drain;
    const dispatched = await runBriefing();
    if (!dispatched) {
      activeBriefingDrain = null;
      drain.cancel();
      // eslint-disable-next-line no-console
      console.warn("[startup] step 1: briefing POST failed — proceeding without it");
    } else {
      const how = await drain.done;
      activeBriefingDrain = null;
      const elapsed = Date.now() - startedAt;
      if (how === "drained") {
        // eslint-disable-next-line no-console
        console.log(`[startup] step 1: briefing drained (${elapsed}ms)`);
      } else if (how === "no-audio") {
        // eslint-disable-next-line no-console
        console.log(`[startup] step 1: briefing produced no audio (${elapsed}ms) — proceeding`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[startup] step 1: briefing drain cap hit (${BRIEFING_DRAIN_CAP_MS}ms) — proceeding`,
        );
      }
    }
  }

  // ── Steps 2 + 3: fire together, in parallel, fire-and-forget ─────────────
  fireOpenOnStart(settings.startupOpenOnStart);
  fireShortcuts(settings.startupShortcuts);

  // ── Step 4 happens in the caller: the FSM opens the mic ──────────────────
  // eslint-disable-next-line no-console
  console.log(`[startup] sequence done in ${Date.now() - startedAt}ms — mic path proceeds`);
}
