// apps/desktop/src/hud/background-tasks.ts
// The background-task registry + HUD chip renderer.
//
// WHY: a dispatched action (a WhatsApp/iMessage send, a screenshot describe, a
// long AppleScript, a computer-use post) runs fire-and-forget so the voice loop
// never blocks. But an in-flight send used to be invisible — you spoke "yes",
// the send detached, and nothing on-screen told you it was still going. This
// module gives those detached tasks a tiny visible presence: one running loader
// chip per in-flight task, stacked top-right, each resolving independently to
// done/failed and then fading out. It mirrors the routine loader's visual
// register (glassy panel, cyan accent, dot-pulse) so the chips read as part of
// the same system.
//
// It is purely presentational and owns NO dispatch logic. `startTask` /
// `resolveTask` are called AROUND the already-detached dispatch promises; they
// never introduce an await on the transcript/capture path. Multiple concurrent
// tasks each track + render independently (two sends + a screenshot = three
// chips, each settling on its own).

/** How long a settled (done/failed) chip lingers before it fades out — long
 *  enough to register the ✓/✕, short enough to clear promptly. Mirrors the
 *  routine loader's done-linger feel. */
const DONE_LINGER_MS = 2_200;

export interface BackgroundTask {
  id: string;
  kind: string;
  label: string;
  status: "running" | "done" | "failed";
  startedAt: number;
}

/** Live registry of in-flight (and briefly-settled) tasks, keyed by id. */
const tasks = new Map<string, BackgroundTask>();
/** Linger timers per settled task, so a double-resolve can't double-remove. */
const lingerTimers = new Map<string, ReturnType<typeof setTimeout>>();

type TasksListener = (tasks: BackgroundTask[]) => void;
const listeners = new Set<TasksListener>();

/** Subscribe to registry changes. Mirrors `onConfirmPendingChange` in
 *  confirm-gate.ts: returns an unsubscribe fn. The listener receives a fresh
 *  snapshot array (ordered by startedAt) on every change. */
export function onTasksChange(fn: TasksListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function snapshot(): BackgroundTask[] {
  return [...tasks.values()].sort((a, b) => a.startedAt - b.startedAt);
}

function emit(): void {
  const snap = snapshot();
  for (const fn of listeners) fn(snap);
}

let counter = 0;
function mintId(): string {
  const c = (globalThis.crypto as Crypto | undefined);
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  counter += 1;
  return `task-${Date.now()}-${counter}`;
}

/**
 * Register a new in-flight task and return its id. Call this right before a
 * detached dispatch; pass the id to `resolveTask` when the dispatch settles.
 */
export function startTask(opts: { kind: string; label: string }): string {
  const id = mintId();
  tasks.set(id, {
    id,
    kind: opts.kind,
    label: opts.label,
    status: "running",
    startedAt: Date.now(),
  });
  emit();
  return id;
}

/**
 * Mark a task done/failed, then after a short linger drop it so its chip fades
 * out. Guarded against double-resolve and unknown ids.
 */
export function resolveTask(id: string, status: "done" | "failed"): void {
  const task = tasks.get(id);
  if (!task) return;
  // Already settled — don't re-arm the linger or flip a done→failed race.
  if (task.status !== "running") return;

  task.status = status;
  emit();

  const existing = lingerTimers.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    lingerTimers.delete(id);
    tasks.delete(id);
    emit();
  }, DONE_LINGER_MS);
  lingerTimers.set(id, timer);
}

// ───────────────────────────── chip renderer ─────────────────────────────

/** Minimal HTML escape for the chip label (untrusted recipient/task text). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CONTAINER_ID = "background-tasks";

/** Lazily create/mount the stacking container for the chips. */
function ensureContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Reconcile chip elements against the current task list. Chips are keyed by
 * task id via `data-task-id`, so each concurrent task owns its own chip and
 * settles independently. Runs on every registry change.
 */
export function renderBackgroundTaskChips(list: BackgroundTask[]): void {
  const container = ensureContainer();
  const seen = new Set<string>();

  for (const task of list) {
    seen.add(task.id);
    let chip = container.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "task-chip";
      chip.dataset.taskId = task.id;
      chip.innerHTML =
        `<span class="task-dot" aria-hidden="true"></span>` +
        `<span class="task-label"></span>`;
      container.appendChild(chip);
    }
    chip.dataset.status = task.status;
    const labelEl = chip.querySelector<HTMLElement>(".task-label");
    if (labelEl) labelEl.innerHTML = escapeHtml(task.label);
  }

  // Remove chips whose task has left the registry (faded/dropped).
  for (const chip of [...container.querySelectorAll<HTMLElement>(".task-chip")]) {
    const id = chip.dataset.taskId;
    if (!id || !seen.has(id)) chip.remove();
  }
}

let monitorStarted = false;

/**
 * Wire the chip renderer to the registry. Called once from boot(). Idempotent
 * (matches the `started` guard pattern used across the HUD modules).
 */
export function startBackgroundTasksMonitor(): void {
  if (monitorStarted) return;
  monitorStarted = true;
  ensureContainer();
  onTasksChange(renderBackgroundTaskChips);
}
