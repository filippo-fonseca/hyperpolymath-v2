/**
 * mappings.ts — U-04 · The Studiolo · data-bridge
 *
 * The data→visual grammar, codified. Classifies each task into an `EmberState`,
 * carries the priority "filament" flags, co-locates the ember visual constants
 * (so U-09 reads numbers, not prose), and assembles tasks into positioned
 * `EmberSlot`s via the pure geometry helpers in `treeLayout.ts`.
 *
 * "Today" is computed in the USER'S LOCAL TIMEZONE via `toYmd(new Date())`
 * (@/lib/tasks/date-shortcuts) — the exact helper the 2D task surfaces use.
 * `dueDate` is a plain `YYYY-MM-DD` DATE string from Drizzle; it is compared to
 * `todayYmd` as a STRING (lexicographic ordering is correct for zero-padded
 * dates). A `Date` is NEVER constructed from `dueDate` — that reintroduces the
 * UTC-midnight drift documented at TasksClient.tsx:339-345.
 */
import { toYmd } from "@/lib/tasks/date-shortcuts";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { EmberSlot, TreeLayoutResult } from "./treeLayout";
import { emberShellPosition, trunkShellPosition } from "./treeLayout";

export type EmberState = "ambient" | "today" | "overdue" | "ascending";

/**
 * Today in the user's local timezone as a `YYYY-MM-DD` string. Delegates to the
 * shared `toYmd` — do NOT reimplement, and do NOT use the UTC `todayISODate()`
 * from @/lib/projects/archive-status (that one is for server-side project
 * expiry, not task due-days).
 */
export function todayYmd(): string {
  return toYmd(new Date());
}

/**
 * The truth table. `lesno` (done) is checked FIRST so it trumps date-based
 * states — mirrors the 2D overdue predicate that explicitly excludes lesno
 * (TasksClient.tsx:325-327, :369). `"ascending"` only ever manifests through
 * the differ's completion event; completed rows never receive a resident slot.
 */
export function classifyTask(t: TaskWithProjects, today: string): EmberState {
  if (t.status === "lesno") return "ascending"; // done — trumps dates
  if (t.dueDate !== null && t.dueDate < today) return "overdue";
  if (t.dueDate === today) return "today";
  return "ambient"; // undated or future-dated
}

// Priority is orthogonal to state: P∞/P1 get a vertical filament taper.
export function hasFilament(t: TaskWithProjects): boolean {
  return (t.priority === "P∞" || t.priority === "P1") && t.status !== "lesno";
}

export function filamentScaleY(t: TaskWithProjects): number {
  return t.priority === "P∞" ? 2.8 : 2.2; // P∞ taller than P1 (PLAN §6)
}

// ── The ember grammar, single source (§3.3) ────────────────────────────────
// Values verbatim from PLAN §1.7 + §6 mapping table. U-09 reads these numbers.
export const EMBER_VISUALS = {
  today: { color: "#E8C46B", pulseHz: 0.5, emissiveMin: 1.6, emissiveMax: 2.6, yOffset: 0 },
  overdue: { color: "#FF6B4A", pulseHz: 0, emissive: 1.8, yOffset: -0.12 },
  ambient: { color: "#F2E9D8", pulseHz: 0.2, emissive: 0.9, yOffset: 0 },
  ascending: { flareMs: 300, flareMul: 3, riseY: 6, riseMs: 2200, ease: "easeIn" },
} as const;

// ── tasks → slots (§3.4) ───────────────────────────────────────────────────
// Pure, deterministic, O(n log n). Memoized by the provider on [tasks, layout,
// todayYmd]. Each task's slot is stable regardless of the input array order.
export function buildEmberSlots(
  tasks: TaskWithProjects[],
  layout: TreeLayoutResult,
  today: string,
): EmberSlot[] {
  // 1. Completed tasks have no resident ember (their exit is the ascent anim).
  const active = tasks.filter((t) => t.status !== "lesno");

  // 2. Partition: lantern group (by first project link) or trunk group. A task
  // whose projects[0].id is unknown to the layout (archived project/area) falls
  // back to the trunk group — never dropped silently.
  const lanternGroups = new Map<string, TaskWithProjects[]>();
  const trunkGroup: TaskWithProjects[] = [];
  for (const t of active) {
    const pid = t.projects[0]?.id;
    if (pid !== undefined && layout.byProject.has(pid)) {
      const group = lanternGroups.get(pid) ?? [];
      group.push(t);
      lanternGroups.set(pid, group);
    } else {
      trunkGroup.push(t);
    }
  }

  // Rank comparator: createdAt asc, then id asc.
  const byCreatedThenId = (a: TaskWithProjects, b: TaskWithProjects): number => {
    const dt = a.createdAt.getTime() - b.createdAt.getTime();
    if (dt !== 0) return dt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  const slots: EmberSlot[] = [];

  for (const [projectId, group] of lanternGroups) {
    group.sort(byCreatedThenId);
    const lantern = layout.byProject.get(projectId)!;
    const n = group.length;
    group.forEach((t, k) => {
      slots.push({
        taskId: t.id,
        lanternId: projectId,
        basePosition: emberShellPosition(lantern.position, k, n, t.id),
        state: classifyTask(t, today),
      });
    });
  }

  trunkGroup.sort(byCreatedThenId);
  trunkGroup.forEach((t, k) => {
    slots.push({
      taskId: t.id,
      lanternId: null,
      basePosition: trunkShellPosition(k),
      state: classifyTask(t, today),
    });
  });

  return slots;
}
