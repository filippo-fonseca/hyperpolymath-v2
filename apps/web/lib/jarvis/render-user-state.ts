// CACHE-CRITICAL FILE — see CACHE-05 grep gate allowlist.
// Forbidden APIs in this file: the clock-reading and unsorted-stringify
// patterns enumerated in the CACHE-05 audit checklist. Any reference to
// those APIs (in code OR comments) is treated as a regression by the
// grep gate, so this file deliberately names none of them in prose. The
// allowlist + per-line CACHE-OK escape live in the gate test fixture.
//
// Pure function: same inputs always produce byte-identical output. The
// Anthropic cache hits on the 5-min tier depend on this invariant
// holding across every render.
//
// Phase 11 / CACHE-02 — XML-tagged state serializer for the 5-min cache
// tier. The route boundary fetches `state_version` plus the snapshot
// inputs and calls this serializer (via state-snapshot-cache.ts) to
// produce the prompt block that sits BELOW the 1h-TTL frozen system
// blocks and ABOVE the per-turn messages. Determinism + zero hidden
// state is what makes byte-for-byte reuse possible at Wave 2.
//
// Per D-05 (11-CONTEXT.md), exactly 5 named sections — 6 XML blocks
// total because `<projects>` splits into active/upcoming. Each section
// sorted by `a.id.localeCompare(b.id)` ASC, capped (50 captures / 10
// tasks / 5 projects each), date-only timestamps (captures + tasks) /
// HH:MM only (calendar). NO build-moment attribute on any block — the
// only freshness signal that matters is the `state_version` held by
// the cache.

export interface SnapshotInputs {
  areas: Array<{ id: string; name: string }>;
  projectsActive: Array<{ id: string; name: string; areaId: string }>;
  projectsUpcoming: Array<{ id: string; name: string; areaId: string }>;
  /** Last 50 captures by created_at DESC (caller pre-fetches). */
  recentCaptures: Array<{ id: string; createdAt: Date; content: string }>;
  /** Today's events from Google Calendar, already in user's IANA timezone. */
  todayCalendar: Array<{ id: string; startHHMM: string; endHHMM: string; title: string }>;
  /** Today's date stamp (caller derives once at route boundary; the serializer never reads any clock). */
  todayDate: string; // YYYY-MM-DD
  /** Next 10 active tasks by due_at ASC NULLS LAST (caller pre-fetches). */
  activeTasks: Array<{ id: string; status: string; dueAt: Date | null; title: string; projectId: string | null }>;
}

// Caps per D-05 — captures live longest, tasks medium, projects short.
const CAP_CAPTURES = 50;
const CAP_TASKS = 10;
const CAP_PROJECTS = 5;

// Literal em dash (U+2014) for null-valued task fields. Hardcoded as a
// single character so consumers can grep for `"due —"` reliably.
const EM_DASH = "—";

// UTC date components — server-tz-agnostic, prevents silent invalidator
// if Vercel region drifts. Pure transform: input Date → "YYYY-MM-DD"
// string. Reads ONLY the Date passed in.
function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderAreas(areas: SnapshotInputs["areas"]): string {
  const sorted = [...areas].sort((a, b) => a.id.localeCompare(b.id));
  const lines = sorted.map((a) => `- ${a.id} "${a.name}"`);
  if (lines.length === 0) return "<areas>\n</areas>";
  return `<areas>\n${lines.join("\n")}\n</areas>`;
}

function renderProjectsActive(
  projects: SnapshotInputs["projectsActive"],
): string {
  const sorted = [...projects].sort((a, b) => a.id.localeCompare(b.id));
  const capped = sorted.slice(0, CAP_PROJECTS);
  const lines = capped.map((p) => `- ${p.id} "${p.name}" (${p.areaId})`);
  const open = '<projects status="active">';
  if (lines.length === 0) return `${open}\n</projects>`;
  return `${open}\n${lines.join("\n")}\n</projects>`;
}

function renderProjectsUpcoming(
  projects: SnapshotInputs["projectsUpcoming"],
): string {
  const sorted = [...projects].sort((a, b) => a.id.localeCompare(b.id));
  const capped = sorted.slice(0, CAP_PROJECTS);
  const lines = capped.map((p) => `- ${p.id} "${p.name}" (${p.areaId})`);
  const open = '<projects status="upcoming">';
  if (lines.length === 0) return `${open}\n</projects>`;
  return `${open}\n${lines.join("\n")}\n</projects>`;
}

function renderRecentCaptures(
  captures: SnapshotInputs["recentCaptures"],
): string {
  const sorted = [...captures].sort((a, b) => a.id.localeCompare(b.id));
  const capped = sorted.slice(0, CAP_CAPTURES);
  const lines = capped.map(
    (c) => `- ${c.id} (${formatDateOnly(c.createdAt)}) "${c.content}"`,
  );
  // Count reflects POST-cap (slice length), not input length — see D-05.
  const open = `<recent_captures count="${capped.length}">`;
  if (lines.length === 0) return `${open}\n</recent_captures>`;
  return `${open}\n${lines.join("\n")}\n</recent_captures>`;
}

function renderTodayCalendar(
  events: SnapshotInputs["todayCalendar"],
  todayDate: string,
): string {
  // Calendar events already arrive pre-fetched; sort by ID for
  // determinism. Caller is responsible for the upstream "today's events"
  // filter and HH:MM string formatting.
  const sorted = [...events].sort((a, b) => a.id.localeCompare(b.id));
  const lines = sorted.map((e) => `- ${e.startHHMM}-${e.endHHMM} "${e.title}"`);
  const open = `<today_calendar date="${todayDate}">`;
  if (lines.length === 0) return `${open}\n</today_calendar>`;
  return `${open}\n${lines.join("\n")}\n</today_calendar>`;
}

function renderActiveTasks(tasks: SnapshotInputs["activeTasks"]): string {
  const sorted = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
  const capped = sorted.slice(0, CAP_TASKS);
  const lines = capped.map((t) => {
    const due = t.dueAt === null ? EM_DASH : formatDateOnly(t.dueAt);
    const project = t.projectId === null ? EM_DASH : t.projectId;
    return `- ${t.id} (${t.status}, due ${due}) "${t.title}" — ${project}`;
  });
  const open = `<active_tasks count="${capped.length}">`;
  if (lines.length === 0) return `${open}\n</active_tasks>`;
  return `${open}\n${lines.join("\n")}\n</active_tasks>`;
}

/**
 * Pure XML state serializer for the 5-min Anthropic prompt cache tier.
 *
 * Contract:
 * - Same inputs → byte-identical output (no clock reads, no I/O).
 * - Sort by `a.id.localeCompare(b.id)` ASC inside every section.
 * - Cap: 50 captures / 10 tasks / 5 active projects / 5 upcoming projects.
 * - Dates render as YYYY-MM-DD (UTC components); calendar uses HH:MM only.
 * - Empty sections still emit their opening/closing tags — model needs
 *   structural consistency across turns for cache key alignment.
 *
 * Output shape (sections concatenated with "\n\n" + trailing newline):
 *
 *   <areas>
 *   - ${area.id} "${area.name}"
 *   </areas>
 *
 *   <projects status="active">
 *   - ${project.id} "${project.name}" (${project.areaId})
 *   </projects>
 *
 *   <projects status="upcoming">
 *   ...
 *   </projects>
 *
 *   <recent_captures count="${N}">
 *   - ${capture.id} (${YYYY-MM-DD}) "${capture.content}"
 *   </recent_captures>
 *
 *   <today_calendar date="${todayDate}">
 *   - ${startHHMM}-${endHHMM} "${event.title}"
 *   </today_calendar>
 *
 *   <active_tasks count="${N}">
 *   - ${task.id} (${status}, due ${YYYY-MM-DD|—}) "${task.title}" — ${projectId|—}
 *   </active_tasks>
 *
 * Wave 2's state-snapshot-cache.ts wraps this in the
 * `{ type: "text", text, cache_control: { type: "ephemeral" } }`
 * envelope when appending to the Anthropic system block array.
 */
export function renderUserState(inputs: SnapshotInputs): string {
  const sections = [
    renderAreas(inputs.areas),
    renderProjectsActive(inputs.projectsActive),
    renderProjectsUpcoming(inputs.projectsUpcoming),
    renderRecentCaptures(inputs.recentCaptures),
    renderTodayCalendar(inputs.todayCalendar, inputs.todayDate),
    renderActiveTasks(inputs.activeTasks),
  ];
  return `${sections.join("\n\n")}\n`;
}
