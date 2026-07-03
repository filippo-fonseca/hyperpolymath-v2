// apps/desktop/src/routines/registry.ts
// The single owner of "which routines exist and how each trigger dispatches".
//
// Routines are authored in the WEB app and stored server-side; the desktop
// READS the owner's enabled routines (getRoutines) on boot + on a poll, and
// rebuilds its trigger surface from scratch each sync:
//   - phrase table (wake + utterance) → consumed by the generalized wake probe
//   - hotkey list                     → consumed by the routine hotkey manager
//   - time list                       → consumed by the routine scheduler
//
// Every trigger type funnels into ONE execution path — fireRoutine — which
// POSTs the routine's blocks inline (postRunRoutine). The server streams each
// block's result over the physical SSE bus, which main.ts already renders +
// speaks. The desktop TRIGGERS; the server SEQUENCES the blocks.
//
// Injection seams (avoid module cycles, same pattern as
// wake-probe.setWakeTriggerHandler / sse-client.setTriggerHandler):
//   - setRoutineBusyCheck(fn)  — FSM half-duplex gate (main.ts wires it)
//   - setHotkeySync(fn)        — routines/hotkeys.ts registers its syncer
//   - setSchedulerSync(fn)     — routines/scheduler.ts registers its syncer

import type { Routine } from "@hyperpolymath/jarvis-core/routines";

import { getRoutines, postRunRoutine } from "@/api/client";
import { stopWakeLoop } from "@/wake/wake-probe";

// --- State ----------------------------------------------------------------

let routines: Routine[] = [];

/** wake + utterance triggers, compiled to matchers over probed STT text. */
export interface PhraseEntry {
  re: RegExp;
  routineId: string;
  type: "wake" | "utterance";
}
let phraseTable: PhraseEntry[] = [];

/** hotkey triggers → (accelerator, routineId). */
export interface HotkeyEntry {
  accelerator: string;
  routineId: string;
}
let hotkeyEntries: HotkeyEntry[] = [];

/** routines carrying ≥1 time trigger (have a server-provided nextRunAt). */
let timeRoutines: Routine[] = [];

// De-dup guard: a phrase heard across two consecutive probe windows (~2.2s
// apart) must not double-fire. Cleared when a run is (best-effort) settled.
const inFlight = new Set<string>();

// --- Injection seams ------------------------------------------------------

let busyCheck: (() => boolean) | null = null;
let hotkeySync: ((entries: HotkeyEntry[]) => void) | null = null;
let schedulerSync: ((routines: Routine[]) => void) | null = null;

/** FSM half-duplex gate: true when JARVIS is thinking/speaking (main.ts). */
export function setRoutineBusyCheck(fn: () => boolean): void {
  busyCheck = fn;
}

/** routines/hotkeys.ts registers its diff-register syncer here. */
export function setHotkeySync(fn: (entries: HotkeyEntry[]) => void): void {
  hotkeySync = fn;
}

/** routines/scheduler.ts registers its time-list syncer here. */
export function setSchedulerSync(fn: (routines: Routine[]) => void): void {
  schedulerSync = fn;
}

// --- Phrase matching (consumed by the generalized wake probe) -------------

/** Escape arbitrary user text for safe use inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match probed STT text against the routine phrase table. Returns the first
 * matching routine id, or null. Injected into wake-probe via setPhraseMatcher
 * so ONE idle mic loop serves both the built-in "Daddy's Home" wake and every
 * phrase-triggered routine.
 */
export function matchPhrase(text: string): string | null {
  for (const entry of phraseTable) {
    if (entry.re.test(text)) return entry.routineId;
  }
  return null;
}

/** True when any enabled routine has a wake/utterance trigger. */
export function hasPhraseTriggers(): boolean {
  return phraseTable.length > 0;
}

// --- Dispatch table rebuild ----------------------------------------------

function rebuildDispatch(): void {
  const nextPhrase: PhraseEntry[] = [];
  const nextHotkeys: HotkeyEntry[] = [];
  const nextTime: Routine[] = [];

  for (const routine of routines) {
    let hasTime = false;
    for (const trigger of routine.spec.triggers) {
      if (trigger.type === "wake") {
        nextPhrase.push({
          re: new RegExp(`\\b${escapeRegExp(trigger.phrase.trim())}\\b`, "i"),
          routineId: routine.id,
          type: "wake",
        });
      } else if (trigger.type === "utterance") {
        nextPhrase.push({
          re: new RegExp(`\\b${escapeRegExp(trigger.match.trim())}\\b`, "i"),
          routineId: routine.id,
          type: "utterance",
        });
      } else if (trigger.type === "hotkey") {
        nextHotkeys.push({ accelerator: trigger.accelerator, routineId: routine.id });
      } else if (trigger.type === "time") {
        hasTime = true;
      }
    }
    if (hasTime) nextTime.push(routine);
  }

  phraseTable = nextPhrase;
  hotkeyEntries = nextHotkeys;
  timeRoutines = nextTime;

  // Hand the derived tables to the trigger managers (each idempotent + diffing).
  hotkeySync?.(hotkeyEntries);
  schedulerSync?.(timeRoutines);

  // eslint-disable-next-line no-console
  console.log(
    `[routines] dispatch rebuilt — ${phraseTable.length} phrase, ${hotkeyEntries.length} hotkey, ${timeRoutines.length} time`,
  );
}

// --- Sync -----------------------------------------------------------------

/**
 * Re-fetch the owner's enabled routines and rebuild the whole trigger surface.
 * Called on boot, on the poll interval, and after a device-token save (when
 * routines first become fetchable). Fail-safe: getRoutines() returns [] on any
 * error, which cleanly tears down all routine triggers rather than crashing.
 */
export async function refreshRoutines(): Promise<void> {
  routines = await getRoutines();
  // eslint-disable-next-line no-console
  console.log(`[routines] synced ${routines.length} enabled routine(s)`);
  rebuildDispatch();
}

/** Current in-memory routines (read-only view for the scheduler). */
export function getRoutineById(id: string): Routine | undefined {
  return routines.find((r) => r.id === id);
}

// --- The single execution path -------------------------------------------

/**
 * Fire a routine by id. The ONE path all four trigger types converge on.
 *
 *   1. De-dup: ignore a routine already in flight.
 *   2. Half-duplex: for time/hotkey, defer when JARVIS is busy (thinking/
 *      speaking) so a fire never talks over an in-flight turn. Wake/utterance
 *      already released the mic in the probe, so they proceed.
 *   3. Release the idle wake mic (idempotent) so the routine's spoken block
 *      results can't feed back into the idle probe.
 *   4. POST the routine's blocks inline; the server streams each block over
 *      the SSE bus and the existing main.ts listeners render + speak them.
 */
export async function fireRoutine(
  routineId: string,
  triggerType: "wake" | "utterance" | "time" | "hotkey",
): Promise<void> {
  const routine = getRoutineById(routineId);
  if (!routine) {
    // eslint-disable-next-line no-console
    console.warn(`[routines] fire skipped — unknown routine ${routineId}`);
    return;
  }
  if (inFlight.has(routineId)) {
    // eslint-disable-next-line no-console
    console.log(`[routines] fire skipped — ${routineId} already in flight`);
    return;
  }
  // Half-duplex for the "unsolicited" trigger types. Wake/utterance funnel
  // through the probe which already released the mic, so they don't defer.
  if ((triggerType === "time" || triggerType === "hotkey") && busyCheck?.()) {
    // eslint-disable-next-line no-console
    console.log(`[routines] fire deferred — busy (${triggerType} ${routineId})`);
    return;
  }

  inFlight.add(routineId);
  // eslint-disable-next-line no-console
  console.log(`[routines] fire ${routineId} (${triggerType}) — "${routine.name}"`);

  // Release the idle wake mic so block TTS doesn't self-trigger the probe.
  await stopWakeLoop();

  const ok = await postRunRoutine(routine);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(`[routines] run POST failed for ${routineId}`);
  }

  // The run streams asynchronously over SSE; we can't cheaply observe its
  // final response-end here without a run-level marker (deferred). Clear the
  // guard after a conservative window so a long multi-block run can't be
  // re-triggered mid-flight, while a later legitimate fire still works.
  setTimeout(() => inFlight.delete(routineId), 60_000);
}
