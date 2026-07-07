/**
 * diffing.ts — U-04 · The Studiolo · data-bridge
 *
 * The snapshot differ (detects status→`lesno` completion TRANSITIONS plus new/
 * removed rows), the tiny mitt-style `worldEvents` emitter with FROZEN event
 * names, and the FROZEN `cameraBus`/`fireflyBus` signatures other units depend
 * on (implemented in their owners' files; only the SHAPES freeze here).
 *
 * Nothing here runs per-frame. The differ runs at Realtime cadence from the
 * provider's snapshot effect. `worldEvents` is a module-level singleton (NOT
 * React state), for one-shot choreography only — the declarative slot array is
 * the source of truth for what's on screen.
 */
import type { Vector3Tuple } from "three";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { EmberSlot } from "./treeLayout";
import type { EmberState } from "./mappings";
import { classifyTask } from "./mappings";
// Type-only; exported at jarvis-stream-client.ts:66.
import type { JarvisActionEvent } from "@/components/jarvis/jarvis-stream-client";

// ── The differ (§4.1) ──────────────────────────────────────────────────────
export interface TaskTransition {
  taskId: string;
  from: EmberState; // classifyTask(prevRow, today) — 'ambient' | 'today' | 'overdue'
  to: "ascending";
  slot: EmberSlot; // the slot the ember occupied BEFORE completion (ascent origin)
}

export interface SnapshotDiff {
  completed: TaskTransition[];
  added: TaskWithProjects[]; // ids in next, absent from prev (non-lesno only)
  removedIds: string[]; // ids in prev, absent from next
}

/**
 * O(n) snapshot diff using Maps/Sets.
 *
 * - Completion = prevRow existed, prevRow.status !== "lesno", nextRow.status ===
 *   "lesno". This is the ONLY trigger for `task-completed` — a transition, never
 *   a level. Already-lesno-in-both emits nothing (idempotent across refetches).
 * - If the completing task has no slot in `prevSlots` (created + completed
 *   between snapshots, no ember ever existed) the completion is silently dropped
 *   — a bell without a spark would lie.
 * - `added` excludes rows arriving already-lesno. `removedIds` includes
 *   everything that vanished.
 */
export function diffSnapshots(
  prev: Map<string, TaskWithProjects>,
  next: TaskWithProjects[],
  prevSlots: Map<string, EmberSlot>,
  today: string,
): SnapshotDiff {
  const completed: TaskTransition[] = [];
  const added: TaskWithProjects[] = [];
  const nextIds = new Set<string>();

  for (const nextRow of next) {
    nextIds.add(nextRow.id);
    const prevRow = prev.get(nextRow.id);
    if (prevRow === undefined) {
      if (nextRow.status !== "lesno") added.push(nextRow);
      continue;
    }
    if (prevRow.status !== "lesno" && nextRow.status === "lesno") {
      const slot = prevSlots.get(nextRow.id);
      if (slot !== undefined) {
        completed.push({
          taskId: nextRow.id,
          from: classifyTask(prevRow, today),
          to: "ascending",
          slot,
        });
      }
    }
  }

  const removedIds: string[] = [];
  for (const id of prev.keys()) {
    if (!nextIds.has(id)) removedIds.push(id);
  }

  return { completed, added, removedIds };
}

// ── The event differ (Phase 2 M-01) ────────────────────────────────────────
export interface EventSnapshotDiff {
  added: string[]; // eventIds in `next`, absent from `prev`
  removed: string[]; // eventIds in `prev`, absent from `next`
}

/**
 * O(n) event snapshot diff over gcal event ids — the SAME Map/Set pattern as
 * `diffSnapshots`. Lets `EventTablets` (M-06) spring a newly-appeared tablet in
 * (and visibly rivet a Jarvis-created event) and freelist-release a vanished
 * one. It intentionally gets NO `worldEvents` name: EventTablets diffs in its
 * own data-change effect, exactly how `Fireflies` handles capture rows today.
 *
 * Only event IDENTITY (id present/absent) is diffed — a moved/renamed event
 * keeps its id, so it re-poses through the declarative slot array rather than
 * springing. This is deliberate: the tablet stays "the same tablet," it just
 * slides on the dial.
 */
export function diffEventSnapshots(
  prev: Map<string, GcalEventDTO>,
  next: GcalEventDTO[],
): EventSnapshotDiff {
  const added: string[] = [];
  const nextIds = new Set<string>();

  for (const e of next) {
    nextIds.add(e.id);
    if (!prev.has(e.id)) added.push(e.id);
  }

  const removed: string[] = [];
  for (const id of prev.keys()) {
    if (!nextIds.has(id)) removed.push(id);
  }

  return { added, removed };
}

// ── `worldEvents` — the tiny mitt-style emitter (FROZEN, §4.3) ──────────────
// Exactly these SIX event names. No additions without an orchestrator
// amendment. Do NOT install `mitt`.
//
// Phase 2 M-01 orchestrator amendment: +1 name `"meridian-toll"` (bus 5 → 6).
// Emitted by the T-15 scheduler (M-09); consumed by the positional-audio node
// (M-09) and the tablet lean-down (M-06). The `chime` union is intentionally
// NOT extended — the toll is positional and does NOT route through Chimes.tsx.
export type WorldEventMap = {
  "task-completed": TaskTransition;
  "capture-created": { captureId: string };
  chime: { kind: "glass-bell" | "cork-pop" | "two-note" };
  "jarvis-action": JarvisActionEvent;
  "boot-complete": void;
  "meridian-toll": { eventId: string; title: string; startIso: string };
};

type AnyHandler = (payload: unknown) => void;
const listeners = new Map<string, Set<AnyHandler>>();

export const worldEvents = {
  /** Subscribe; returns an unsubscribe function. */
  on<K extends keyof WorldEventMap>(
    ev: K,
    fn: (payload: WorldEventMap[K]) => void,
  ): () => void {
    const key = ev as string;
    let set = listeners.get(key);
    if (set === undefined) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(fn as AnyHandler);
    return () => {
      const s = listeners.get(key);
      if (s === undefined) return;
      s.delete(fn as AnyHandler);
      if (s.size === 0) listeners.delete(key);
    };
  },
  /**
   * Dispatch. Iterates a COPIED array so a listener may unsubscribe mid-dispatch.
   * Listener errors are caught + logged so one bad subscriber can't kill the
   * choreography.
   */
  emit<K extends keyof WorldEventMap>(ev: K, payload: WorldEventMap[K]): void {
    const s = listeners.get(ev as string);
    if (s === undefined) return;
    for (const fn of Array.from(s)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[worldEvents] listener error for "${String(ev)}"`, err);
      }
    }
  },
};

// ── Bus signatures other units depend on (FROZEN here, implemented elsewhere) ──
// These SHAPES freeze at end of wave 1 with this memo (§4.4). The runtime
// singletons live in their owners' files:
//   - `cameraBus` in camera/CameraRig.tsx (U-07)
//   - `fireflyBus` in tree/Fireflies.tsx (U-14)
// Owners implement `export const cameraBus: CameraBus = { ... }` against these
// interfaces so the seam stays exact without a conflicting implementation here.
export interface CameraPose {
  position: Vector3Tuple;
  target: Vector3Tuple;
}

export interface CameraBus {
  flyTo(pose: CameraPose, ms?: number): Promise<void>;
}

export interface FlightRequest {
  captureId?: string;
  toAreaId: string;
  toProjectId?: string;
  kind: "task" | "note";
}

export interface FireflyBus {
  fly(req: FlightRequest): Promise<void>; // resolves at landing
}
