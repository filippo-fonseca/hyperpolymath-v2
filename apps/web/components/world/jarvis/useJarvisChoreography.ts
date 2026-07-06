"use client";

/**
 * useJarvisChoreography.ts — U-16 · The Studiolo · jarvis-routing-choreography
 *
 * THE thesis animation's brain. When Kiwi routes one sentence to the right
 * place, this layer turns the frozen `worldEvents "jarvis-action"` trigger into
 * cause → effect, exactly once: resolve the receipt to a world position, nudge
 * the camera (bounded), leap a light-thread from the ring, and send a firefly
 * beneath it. The real ember kindles on its own clock (the differ/U-09).
 *
 * CONTRACT FIDELITY (the memo is emphatic):
 *   - ZERO query invalidations/refetches. U-13 already invalidated BEFORE
 *     emitting (useJarvisWorld.ts:229-234); the refetch is already in flight.
 *   - Spawns NO embers and NO resident fireflies — only `fireflyBus.fly(...)`
 *     transients + `lightThreadBus.draw(...)`. The declarative slot arrays are
 *     the source of truth for what exists; U-16 only draws light on top.
 *   - NEVER pushes `focusStack` — a routing is ambient feedback, never a hijack
 *     of the user's Esc depth. The assist is a raw, bounded `cameraBus.flyTo`.
 *
 * Idle discipline: zero frame-cadence React state. Pending routings, pointer
 * state, and assist timestamps are refs; the data mirrors are read in render.
 * The pending-wait sweep runs at data cadence + ONE shared timeout — no polling.
 */

import { createElement, useEffect, useRef, type ReactElement } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Vector3Tuple } from "three";

import { worldEvents, type CameraPose, type FlightRequest } from "../data/diffing";
import type { JarvisActionEvent } from "@/components/jarvis/jarvis-stream-client";
import type {
  BoughLayout,
  EmberSlot,
  TreeLayoutResult,
} from "../data/treeLayout";
import { useWorldData } from "../data/useWorldData";
import { cameraBus, bootDone } from "../camera/CameraRig";
import { fireflyBus, captureSpawnPosition } from "../tree/Fireflies";
import { ringWorldOrigin } from "./JarvisRing";
import { lightThreadBus, LightThreads } from "./LightThread";

// ── Types (§11) ───────────────────────────────────────────────────────────────
/** Where a routed action lands in the world. */
export type ChoreographyTarget =
  | { kind: "lantern"; areaId: string; projectId: string; point: Vector3Tuple }
  | { kind: "trunk"; point: Vector3Tuple } // inbox task → trunk cluster slot
  | { kind: "swarm"; point: Vector3Tuple }; // unfiled capture → spawn point

interface PendingRouting {
  ev: JarvisActionEvent; // re-resolved when the row arrives
  deadline: number; // performance.now() + WAIT_FOR_ROW_MS (2000)
}

// ── Frozen constants (§11) ────────────────────────────────────────────────────
const WAIT_FOR_ROW_MS = 2000;
const MICRO_MS = 600; // update_task attention flick; mirrors LightThread MICRO_MS
const ASSIST_MAX_RAD = (20 * Math.PI) / 180;
const ASSIST_DEADZONE_RAD = (25 * Math.PI) / 180;
const ASSIST_MS = 450;
const ASSIST_COOLDOWN_MS = 4000;
const DRAG_SETTLE_MS = 300;
const ASSIST_TARGET_MAX_DIST = 8; // cap the orbit pivot depth (§6.1)

/**
 * Tool names that must never choreograph. U-13 emits `jarvis-action` for EVERY
 * `ok:true` action — including the find_ tools and ask_clarification
 * (executor.ts:323-332, 595, 618) — so the resolver must no-op them before
 * touching the receipt (§3).
 */
export const NOOP_TOOLS: ReadonlySet<string> = new Set<string>([
  "find_tasks",
  "find_captures",
  "find_events",
  "find_people",
  "ask_clarification",
]);

// ── Module scratch — the only vectors the assist/thread-origin touch ──────────
const _origin = new THREE.Vector3();
const _assistF = new THREE.Vector3();
const _assistD = new THREE.Vector3();

/**
 * Reduced-motion seam (§9). U-19 later rewires this single named function to
 * `useWorldPrefs`; keep it a module function so U-19's diff is one line
 * (mirrors CameraRig.tsx:118-123 / Fireflies.tsx pattern).
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ── Receipt extraction (§2.2) ─────────────────────────────────────────────────
// Receipt is Record<string, unknown>; accept ONLY a string[] under project_ids.
function receiptProjectIds(
  receipt: Record<string, unknown> | undefined,
): string[] {
  if (receipt === undefined) return [];
  const pids = receipt["project_ids"];
  if (!Array.isArray(pids)) return [];
  return pids.filter((x): x is string => typeof x === "string");
}

/**
 * Pure, synchronous, receipt-only resolution (§2.2). Returns null for
 * NOOP_TOOLS, failed extraction, a vanished lantern, or an inbox task (whose
 * trunk slot needs the wait window) — callers escalate null to the
 * wait-for-row window when the tool is waitable.
 */
export function resolveActionDestination(
  ev: JarvisActionEvent,
  layout: TreeLayoutResult,
): ChoreographyTarget | null {
  const name = ev.name;
  if (NOOP_TOOLS.has(name)) return null;

  const pids = receiptProjectIds(ev.result.receipt);
  const first = pids[0];
  if (first !== undefined) {
    // A project id was linked — the lantern must ALSO still exist (a project can
    // be archived between action and event; layout excludes archived).
    const lantern = layout.byProject.get(first);
    if (lantern !== undefined) {
      return {
        kind: "lantern",
        areaId: lantern.areaId,
        projectId: first,
        point: lantern.position,
      };
    }
    // Vanished lantern → fall through to null (wait window, then abandonment).
    return null;
  }

  // No project on the receipt.
  if (name === "create_capture") {
    // Unfiled capture stays a firefly → thread ends at the exact spawn point.
    if (typeof ev.result.id === "string") {
      return { kind: "swarm", point: captureSpawnPosition(ev.result.id) };
    }
    return null;
  }
  // create_task (inbox) → trunk cluster, but the slot position needs the wait
  // window (emberSlots), so the pure resolver returns null here (§2.2 step 4).
  // Everything else (update_task, delete_*, events, facts, people) → null.
  return null;
}

// ── EmberSlot lookup (§2.3) ───────────────────────────────────────────────────
function findEmberSlot(
  taskId: string,
  slots: EmberSlot[],
): EmberSlot | undefined {
  return slots.find((s) => s.taskId === taskId);
}

/**
 * Logic component. Mounted ONCE by the orchestrator in WorldScene (§8.3).
 * Subscribes to worldEvents "jarvis-action" (mount-once effect, data in refs),
 * runs the resolve → assist → thread+fly pipeline, owns the pending-wait map,
 * and renders <LightThreads/> as its only child. Zero frame-cadence React state.
 */
export function JarvisChoreographer(): ReactElement {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const { layout, tasks, captures, emberSlots } = useWorldData();

  // Non-frame state: refs only (§10).
  const pendingRef = useRef<Map<string, PendingRouting>>(new Map());
  const sweepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownRef = useRef(false);
  const lastPointerUpAtRef = useRef(0);
  const lastAssistAtRef = useRef(0);

  // The latest pipeline, mirrored so the mount-once subscription + timers always
  // call current logic while reading current data (the useWorldKeys.ts pattern).
  const handleActionRef = useRef<(ev: JarvisActionEvent) => void>(() => {});
  const sweepRef = useRef<() => void>(() => {});

  // ── Bounded camera assist — a nudge, never a hijack (§6) ────────────────────
  function tryAssist(point: Vector3Tuple): void {
    if (prefersReducedMotion()) return; // §6.2.2
    if (!bootDone()) return; // §6.2.3 — never yank during the Litany
    if (pointerDownRef.current) return; // §6.2.1 — never during a drag
    const now = performance.now();
    if (now - lastPointerUpAtRef.current < DRAG_SETTLE_MS) return; // drag momentum
    if (now - lastAssistAtRef.current < ASSIST_COOLDOWN_MS) return; // §6.2.5 once/turn

    const F = camera.getWorldDirection(_assistF); // current forward (normalized)
    const D = _assistD.set(
      point[0] - camera.position.x,
      point[1] - camera.position.y,
      point[2] - camera.position.z,
    );
    const dist = D.length();
    if (dist < 1e-4) return;
    D.multiplyScalar(1 / dist);

    const fullAngle = Math.acos(Math.max(-1, Math.min(1, F.dot(D))));
    if (fullAngle <= ASSIST_DEADZONE_RAD) return; // §6.2.4 — already on screen

    // Yaw-only: signed angle in the XZ plane, clamped to ±20°, about world +Y.
    const fYaw = Math.atan2(F.x, F.z);
    const dYaw = Math.atan2(D.x, D.z);
    let delta = dYaw - fYaw;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const a =
      delta < -ASSIST_MAX_RAD
        ? -ASSIST_MAX_RAD
        : delta > ASSIST_MAX_RAD
          ? ASSIST_MAX_RAD
          : delta;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const nfx = F.x * cosA + F.z * sinA; // rotate F.xz about +Y by `a`
    const nfz = -F.x * sinA + F.z * cosA;
    const targetDist = Math.min(dist, ASSIST_TARGET_MAX_DIST);

    const pose: CameraPose = {
      position: [camera.position.x, camera.position.y, camera.position.z], // never relocates
      target: [
        camera.position.x + nfx * targetDist,
        camera.position.y + F.y * targetDist,
        camera.position.z + nfz * targetDist,
      ],
    };
    lastAssistAtRef.current = now;
    void cameraBus.flyTo(pose, ASSIST_MS); // fire and forget (§6.3)
  }

  // ── Thread helper — origin from the ring, scratch cloned in by the bus ──────
  function drawThreadTo(
    target: ChoreographyTarget,
    bough: BoughLayout | null,
    durationMs?: number,
  ): void {
    ringWorldOrigin(camera, _origin);
    void lightThreadBus.draw({ from: _origin, target, bough, durationMs });
  }

  // ── Per-tool dispatch of a resolved target (§3) ─────────────────────────────
  function dispatchResolved(
    ev: JarvisActionEvent,
    target: ChoreographyTarget,
    reduced: boolean,
  ): void {
    switch (target.kind) {
      case "lantern": {
        const kind: FlightRequest["kind"] =
          ev.name === "create_capture" ? "note" : "task";
        if (!reduced) {
          tryAssist(target.point); // assist BEFORE the thread (§1 stage 3)
          const bough = layout.byArea.get(target.areaId) ?? null;
          drawThreadTo(target, bough);
        }
        // Flight fires REGARDLESS of reduced motion (§9): U-14 resolves
        // instantly + chimes under reduced motion. Transients only — never pass
        // a captureId (the row was born filed; §7 consumed-resident guard).
        void fireflyBus.fly({
          toAreaId: target.areaId,
          toProjectId: target.projectId,
          kind,
        });
        break;
      }
      case "swarm": {
        // Unfiled capture: the thread ends at the exact spawn point; NO flight —
        // the NEW resident firefly (U-14 reconcile) IS the payoff (§3, §7).
        if (!reduced) drawThreadTo(target, null);
        break;
      }
      case "trunk": {
        // Inbox task (via the wait window): thread to the trunk slot; NO firefly
        // (FlightRequest requires toAreaId), NO assist (§3).
        if (!reduced) drawThreadTo(target, null);
        break;
      }
    }
  }

  // ── update_task handling (§3) — completion, glance, or micro-thread ─────────
  function handleUpdateTask(ev: JarvisActionEvent, reduced: boolean): void {
    const id = ev.result.id;
    const receipt = ev.result.receipt;
    const after = receipt !== undefined ? receipt["after"] : undefined;
    const status =
      after !== null && typeof after === "object"
        ? (after as { status?: unknown }).status
        : undefined;

    if (status === "lesno") {
      // Completion is U-09's sacred ascent — NO thread, never duplicate the
      // flare/bell. Optional lowest-priority glance IF the slot is still
      // resolvable (usually not: a completed task leaves emberSlots).
      if (!reduced && typeof id === "string") {
        const slot = findEmberSlot(id, emberSlots);
        if (slot !== undefined) tryAssist(slot.basePosition);
      }
      return;
    }

    // Any other change: a micro-thread "attention flick" to the task's
    // EmberSlot, only if it exists. No firefly, no assist (§3, §4.6).
    if (reduced || typeof id !== "string") return;
    const slot = findEmberSlot(id, emberSlots);
    if (slot === undefined) return;
    drawThreadTo({ kind: "trunk", point: slot.basePosition }, null, MICRO_MS);
  }

  // ── Re-resolve a pending routing against the arrived row (§2.3) ─────────────
  function resolvePendingTarget(ev: JarvisActionEvent): ChoreographyTarget | null {
    const id = ev.result.id;
    if (typeof id !== "string") return null;

    if (ev.name === "create_task") {
      const task = tasks.find((t) => t.id === id);
      if (task === undefined) return null; // not arrived yet
      const pid = task.projects[0]?.id;
      if (pid !== undefined) {
        const lantern = layout.byProject.get(pid);
        if (lantern !== undefined) {
          return {
            kind: "lantern",
            areaId: lantern.areaId,
            projectId: pid,
            point: lantern.position,
          };
        }
      }
      const slot = findEmberSlot(id, emberSlots);
      if (slot !== undefined) return { kind: "trunk", point: slot.basePosition };
      return null; // slot not built yet
    }

    if (ev.name === "create_capture") {
      const cap = captures.find((c) => c.id === id);
      if (cap === undefined) return null; // not arrived yet
      const pid = cap.projects[0]?.id;
      if (pid !== undefined) {
        const lantern = layout.byProject.get(pid);
        if (lantern !== undefined) {
          return {
            kind: "lantern",
            areaId: lantern.areaId,
            projectId: pid,
            point: lantern.position,
          };
        }
      }
      return { kind: "swarm", point: captureSpawnPosition(id) };
    }

    return null;
  }

  // Arm ONE shared timeout, only while the pending map is non-empty (§2.3).
  function armSweepTimer(): void {
    const pending = pendingRef.current;
    if (pending.size === 0) {
      if (sweepTimerRef.current !== null) {
        clearTimeout(sweepTimerRef.current);
        sweepTimerRef.current = null;
      }
      return;
    }
    if (sweepTimerRef.current !== null) return; // already armed
    let soonest = Infinity;
    for (const pr of pending.values()) if (pr.deadline < soonest) soonest = pr.deadline;
    const delay = Math.max(0, soonest - performance.now()) + 16;
    sweepTimerRef.current = setTimeout(() => {
      sweepTimerRef.current = null;
      sweepRef.current();
    }, delay);
  }

  // Sweep pending routings at data cadence + the shared timeout (§2.3).
  function sweepPending(): void {
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    const now = performance.now();
    for (const [id, pr] of Array.from(pending)) {
      const resolved = resolvePendingTarget(pr.ev);
      if (resolved !== null) {
        pending.delete(id);
        dispatchResolved(pr.ev, resolved, prefersReducedMotion());
        continue;
      }
      if (now >= pr.deadline) {
        pending.delete(id);
        console.warn(
          "[studiolo] routing target never materialized",
          pr.ev.name,
          id,
        );
      }
    }
    armSweepTimer();
  }

  function registerPending(ev: JarvisActionEvent): void {
    const id = ev.result.id;
    if (typeof id !== "string") return;
    const pending = pendingRef.current;
    if (pending.has(id)) return;
    pending.set(id, { ev, deadline: performance.now() + WAIT_FOR_ROW_MS });
    armSweepTimer();
  }

  // ── The entry point: trigger → resolve → choreograph (§1) ───────────────────
  function handleAction(ev: JarvisActionEvent): void {
    const name = ev.name;
    if (NOOP_TOOLS.has(name)) return;
    const reduced = prefersReducedMotion();

    if (name === "update_task") {
      handleUpdateTask(ev, reduced);
      return;
    }

    const target = resolveActionDestination(ev, layout);
    if (target !== null) {
      dispatchResolved(ev, target, reduced);
      return;
    }

    // null: escalate to the wait-for-row window when the tool is waitable
    // (create_task inbox, or a drifted create_* receipt).
    if (
      (name === "create_task" || name === "create_capture") &&
      typeof ev.result.id === "string"
    ) {
      registerPending(ev);
    }
    // delete_*, events, facts, people: no spatial home — nothing.
  }

  // Keep the mirrors current (ref mutation in render — the layoutRef pattern).
  handleActionRef.current = handleAction;
  sweepRef.current = sweepPending;

  // ── Mount-once subscription to the frozen trigger (§1) ──────────────────────
  useEffect(() => {
    const off = worldEvents.on("jarvis-action", (ev) => {
      handleActionRef.current(ev);
    });
    const timerRef = sweepTimerRef;
    const pending = pendingRef.current;
    return () => {
      off();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pending.clear();
    };
  }, []);

  // ── Pointer-state listeners on the canvas (drag guard, §6.2.1) ──────────────
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (): void => {
      pointerDownRef.current = true;
    };
    const onUp = (): void => {
      pointerDownRef.current = false;
      lastPointerUpAtRef.current = performance.now();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  // ── Data-cadence sweep: re-resolve pending routings on Realtime/refetch ─────
  useEffect(() => {
    sweepRef.current();
  }, [tasks, captures, emberSlots]);

  // `.ts` (per spec §11 / checklist) so JSX is via createElement — renders
  // <LightThreads/> as the choreographer's only child (§1).
  return createElement(LightThreads);
}
