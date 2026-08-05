"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { ListFilter, X } from "lucide-react";
import { STATUS_TINT, type TaskStatus } from "./status";

const PRIORITIES = ["P∞", "P1", "P2", "P3"] as const;
const STATUSES = [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
] as const;
// "today"/"this-week"/"this-month" removed — the kanban day view owns the date
// dimension via the day switcher, so a chip filter on those buckets is
// redundant (and would double-filter inside the column body). Overdue + No
// date stay because they cut across the active day's slice.
const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "no-date", label: "No date" },
] as const;

export interface TaskFilterState {
  priority: string[];
  status: string[];
  due: string[];
  project: string[];
}

interface Props {
  projects: { id: string; name: string }[];
  /**
   * Owned by TasksClient (the single nuqs subscriber — the duplicated
   * useQueryStates schema that let the two hooks disagree on first paint is
   * gone). This component is purely presentational.
   */
  filters: TaskFilterState;
  onChange: (patch: Partial<TaskFilterState>) => void;
}

export function TaskFilters({ projects, filters, onChange }: Props) {
  function addTo(key: keyof TaskFilterState, value: string) {
    if (!filters[key].includes(value)) onChange({ [key]: [...filters[key], value] });
  }
  function removeFrom(key: keyof TaskFilterState, value: string) {
    onChange({ [key]: filters[key].filter((x) => x !== value) });
  }

  function projectName(pid: string): string {
    return projects.find((p) => p.id === pid)?.name ?? pid.slice(0, 8);
  }

  function dueLabel(d: string): string {
    return DUE_OPTIONS.find((o) => o.value === d)?.label ?? d;
  }

  const hasFilters =
    filters.priority.length > 0 ||
    filters.status.length > 0 ||
    filters.due.length > 0 ||
    filters.project.length > 0;

  return (
    // A single non-wrapping strip: adding a chip never reflows the toolbar's
    // height; an overflowing chip set scrolls horizontally instead.
    <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none]">
      {/* Filter menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Rest-state craft chip: the menu opener joins the segmented pill
              row's grammar rather than reading as a ghost button. */}
          <button type="button" className="craft-chip shrink-0 cursor-pointer-always">
            <ListFilter size={14} strokeWidth={1.75} />
            Filter
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="text-meta">Add filter</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-meta">Priority</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  disabled={filters.priority.includes(p)}
                  onClick={() => addTo("priority", p)}
                  className="text-meta"
                >
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-meta">Status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  disabled={filters.status.includes(s)}
                  onClick={() => addTo("status", s)}
                  className="text-meta"
                >
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-meta">Due</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {DUE_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  disabled={filters.due.includes(o.value)}
                  onClick={() => addTo("due", o.value)}
                  className="text-meta"
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-meta">Project</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[260px] overflow-auto">
              {projects.length === 0 ? (
                <DropdownMenuItem disabled className="text-meta">
                  No projects yet
                </DropdownMenuItem>
              ) : (
                projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    disabled={filters.project.includes(p.id)}
                    onClick={() => addTo("project", p.id)}
                    className="text-meta"
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {filters.priority.map((p) => (
        <ChipPill
          key={`pri-${p}`}
          label={`Priority: ${p}`}
          onRemove={() => removeFrom("priority", p)}
        />
      ))}
      {filters.status.map((s) => (
        <ChipPill
          key={`sta-${s}`}
          label={`Status: ${s}`}
          tint={STATUS_TINT[s as TaskStatus] ?? null}
          onRemove={() => removeFrom("status", s)}
        />
      ))}
      {filters.due.map((d) => (
        <ChipPill key={`due-${d}`} label={dueLabel(d)} onRemove={() => removeFrom("due", d)} />
      ))}
      {filters.project.map((pid) => (
        <ChipPill
          key={`prj-${pid}`}
          label={projectName(pid)}
          tint={tintFor(pid)}
          onRemove={() => removeFrom("project", pid)}
        />
      ))}

      {hasFilters && (
        <button
          type="button"
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-lg px-2 cursor-pointer-always",
            "text-meta text-[var(--ink-faint)]",
            "transition-colors duration-[160ms] ease-out",
            "hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          )}
          onClick={() => onChange({ priority: [], status: [], due: [], project: [] })}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function ChipPill({
  label,
  tint = null,
  onRemove,
}: {
  label: string;
  /** Optional .tint-<hue> class where the dimension is semantically colored
   * (status via STATUS_TINT, project via tintFor). Null = neutral --selected. */
  tint?: string | null;
  onRemove: () => void;
}) {
  // An applied filter is an ACTIVE craft chip: tinted fill where the filter's
  // dimension carries a semantic hue, the neutral --selected fallback
  // otherwise. Inline padding trims the trailing edge for the remove button
  // (utilities lose to the unlayered .craft-chip padding).
  return (
    <span
      className={cn("craft-chip shrink-0", tint)}
      data-active="true"
      style={{ paddingRight: 6 }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-full p-0.5 opacity-60 transition-opacity duration-[160ms] ease-out hover:opacity-100 cursor-pointer-always"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}
