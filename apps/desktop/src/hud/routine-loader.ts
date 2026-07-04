// apps/desktop/src/hud/routine-loader.ts
// The routine HUD loader — the visible finale of a synthesize(+parallel) voice
// routine ("I'm back home"). Driven ENTIRELY by the `jarvis-routine-progress`
// SSE stream (produced server-side; frozen contract in sse-client.ts). It gives
// an instant "one moment" feel the moment the routine fires, fills a progress
// RING around the reactor orb as sources settle, ticks a live SOURCE CHECKLIST
// (Weather ✓, News ✓, Email…), flips to "composing your brief" while the single
// synthesis turn streams, and clears on `done`.
//
// It is purely presentational and owns no conversation state. It lives OUTSIDE
// the transcript scroll region (a ring overlay on the orb-wrap + a fixed card
// anchored to the top-right rail), so the spoken brief's transcript is never
// covered. The brief arrives as a normal jarvis-response cycle in parallel —
// this loader is additive, correlated only by runId.
//
// Motion: the ring fill is a single CSS transition on a conic-gradient angle
// (GPU-cheap, no rAF loop — the orb already owns one); under
// prefers-reduced-motion every transition collapses to an instant snap. See
// index.html `.routine-loader` styles.

import {
  onJarvisRoutineProgress,
  type JarvisRoutineProgressPayload,
  type RoutineProgressSourcePayload,
} from "@/physical-extender/sse-client";

/**
 * How long the finished loader lingers after `done` before it fades out.
 * Long enough to register the last ✓ and the "brief ready" beat, short enough
 * that it clears while JARVIS is still speaking the closing lines.
 */
const DONE_LINGER_MS = 2_600;

/**
 * Safety valve: if a run never reaches `done` (dropped SSE, crashed synthesis),
 * tear the loader down anyway so it can't get stuck on-screen forever. Reset on
 * every event of the active run.
 */
const STALL_TIMEOUT_MS = 90_000;

/** Per-row visual status on the checklist. */
type RowStatus = "pending" | "active" | "done" | "error";

interface LoaderEls {
  root: HTMLElement;
  ring: HTMLElement;
  ringLabel: HTMLElement;
  title: HTMLElement;
  phaseLine: HTMLElement;
  list: HTMLElement;
}

/**
 * Live state for the single in-flight run. Only one routine loader is visible
 * at a time — a fresh `start` supersedes any run still on screen (rare, but a
 * new run always wins).
 */
interface RunState {
  runId: string;
  routineName: string;
  total: number;
  /** Row element per source index, in authored order. */
  rows: Map<number, HTMLElement>;
  /** How many sources have settled (done or error) — the ring numerator. */
  settled: number;
  /** True once we've flipped into the synthesizing beat. */
  composing: boolean;
}

let started = false;
let els: LoaderEls | null = null;
let run: RunState | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let stallTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(t: ReturnType<typeof setTimeout> | null): null {
  if (t) clearTimeout(t);
  return null;
}

function armStallTimeout(): void {
  stallTimer = clearTimer(stallTimer);
  stallTimer = setTimeout(() => {
    // A run that never terminated — dismiss defensively.
    // eslint-disable-next-line no-console
    console.warn("[routine-loader] stall timeout — dismissing stuck loader");
    dismiss(true);
  }, STALL_TIMEOUT_MS);
}

/** Set the ring fill 0..1 by driving the conic-gradient stop via a CSS var. */
function paintRing(fraction: number): void {
  if (!els) return;
  const clamped = Math.max(0, Math.min(1, fraction));
  els.ring.style.setProperty("--progress", `${(clamped * 360).toFixed(1)}deg`);
  els.ringLabel.textContent = run ? `${run.settled}/${run.total}` : "";
}

/** Build one checklist row element for a source (starts in `pending`). */
function makeRow(source: RoutineProgressSourcePayload): HTMLElement {
  const row = document.createElement("li");
  row.className = "routine-row";
  row.dataset.status = "pending" satisfies RowStatus;

  const mark = document.createElement("span");
  mark.className = "routine-row-mark";
  mark.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "routine-row-label";
  label.textContent = source.label;

  row.append(mark, label);
  return row;
}

function setRowStatus(index: number, status: RowStatus): void {
  const row = run?.rows.get(index);
  if (row) row.dataset.status = status;
}

/** phase "start": show the loader with the full skeleton checklist. */
function onStart(p: JarvisRoutineProgressPayload): void {
  if (!els) return;
  // A new run supersedes any leftover loader instantly.
  dismissTimer = clearTimer(dismissTimer);

  const sources = p.sources ?? [];
  run = {
    runId: p.runId,
    routineName: p.routineName,
    total: p.total,
    rows: new Map(),
    settled: 0,
    composing: false,
  };

  els.title.textContent = p.routineName || "Routine";
  els.phaseLine.textContent = "One moment…";
  els.root.dataset.phase = "gathering";

  // Render every source up front so the user sees the whole plan immediately.
  els.list.replaceChildren();
  for (const s of sources) {
    const row = makeRow(s);
    run.rows.set(s.index, row);
    els.list.append(row);
  }

  paintRing(0);
  els.root.classList.add("visible");
  // Reveal the orb ring (a sibling element inside orb-wrap) via a body flag so
  // it can style off ancestor state without extra JS per frame.
  document.body.dataset.routine = "active";
  armStallTimeout();
}

/** phase "gather-start": mark the row active (spinner/tick-in). */
function onGatherStart(p: JarvisRoutineProgressPayload): void {
  if (!run || run.runId !== p.runId || p.index === undefined) return;
  armStallTimeout();
  els?.root.setAttribute("data-phase", "gathering");
  // Only promote a still-pending row — never downgrade a settled one (out-of-
  // order events under parallel gathering).
  const row = run.rows.get(p.index);
  if (row && row.dataset.status === "pending") setRowStatus(p.index, "active");
  if (els) els.phaseLine.textContent = "Gathering…";
}

/** phase "gather-done": tick (or error) the row and advance the ring. */
function onGatherDone(p: JarvisRoutineProgressPayload): void {
  if (!run || run.runId !== p.runId || p.index === undefined) return;
  armStallTimeout();
  const row = run.rows.get(p.index);
  // Guard against a duplicate/late done for an already-settled row.
  if (row && (row.dataset.status === "done" || row.dataset.status === "error")) return;

  setRowStatus(p.index, p.ok === false ? "error" : "done");
  run.settled = Math.min(run.total, run.settled + 1);
  paintRing(run.total > 0 ? run.settled / run.total : 1);
}

/** phase "synthesizing": all gathered — compose the brief. */
function onSynthesizing(p: JarvisRoutineProgressPayload): void {
  if (!run || run.runId !== p.runId || !els) return;
  armStallTimeout();
  run.composing = true;
  // Any row still pending/active when synthesis begins is treated as settled
  // for the ring (the gather phase is over), so the ring reads full.
  paintRing(1);
  els.ringLabel.textContent = "✓";
  els.root.dataset.phase = "composing";
  els.phaseLine.textContent = "Composing your brief…";
}

/** phase "done": the brief finished — linger briefly, then dismiss. */
function onDone(p: JarvisRoutineProgressPayload): void {
  if (!run || run.runId !== p.runId) return;
  stallTimer = clearTimer(stallTimer);
  if (els) {
    els.root.dataset.phase = "done";
    els.phaseLine.textContent = "Brief ready.";
  }
  dismissTimer = clearTimer(dismissTimer);
  dismissTimer = setTimeout(() => dismiss(false), DONE_LINGER_MS);
}

/** Hide the loader and drop the run. `hard` skips nothing — same teardown. */
function dismiss(_hard: boolean): void {
  dismissTimer = clearTimer(dismissTimer);
  stallTimer = clearTimer(stallTimer);
  run = null;
  document.body.removeAttribute("data-routine");
  if (!els) return;
  els.root.classList.remove("visible");
  els.root.removeAttribute("data-phase");
  // Clear the list after the fade so it doesn't flash empty on the way out.
  const list = els.list;
  setTimeout(() => {
    if (!run) list.replaceChildren();
  }, 400);
}

/**
 * Wire the routine loader to the `jarvis-routine-progress` SSE stream. Called
 * once from boot(). Idempotent. No-op if the loader markup is absent.
 */
export function startRoutineLoader(): void {
  if (started) return;
  started = true;

  const root = document.getElementById("routine-loader");
  const ring = document.getElementById("routine-ring");
  const ringLabel = document.getElementById("routine-ring-label");
  const title = document.getElementById("routine-loader-title");
  const phaseLine = document.getElementById("routine-loader-phase");
  const list = document.getElementById("routine-loader-list");
  if (!root || !ring || !ringLabel || !title || !phaseLine || !list) return;
  els = { root, ring, ringLabel, title, phaseLine, list };

  onJarvisRoutineProgress((p) => {
    switch (p.phase) {
      case "start":
        onStart(p);
        break;
      case "gather-start":
        onGatherStart(p);
        break;
      case "gather-done":
        onGatherDone(p);
        break;
      case "synthesizing":
        onSynthesizing(p);
        break;
      case "done":
        onDone(p);
        break;
      default:
        break;
    }
  });
}
