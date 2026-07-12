"use client";

import { useQueryStates, parseAsArrayOf, parseAsString } from "nuqs";
import { Button } from "@/components/ui/button";
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
import { X } from "lucide-react";

const PRIORITIES = ["P∞", "P1", "P2", "P3"] as const;
const STATUSES = [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
] as const;
// "today"/"this-week"/"this-month" removed — the kanban day view now
// owns the date dimension via its arrow + date-picker header, so a chip
// filter on those buckets is redundant (and would double-filter inside
// the column body). Overdue + No date stay because they cut across the
// active day's slice (overdue ⊂ "any past day"; no date ⊂ Inbox).
const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "no-date", label: "No date" },
] as const;

interface Props {
  projects: { id: string; name: string }[];
}

export function TaskFilters({ projects }: Props) {
  const [filters, setFilters] = useQueryStates(
    {
      priority: parseAsArrayOf(parseAsString).withDefault([]),
      status: parseAsArrayOf(parseAsString).withDefault([]),
      due: parseAsArrayOf(parseAsString).withDefault([]),
      project: parseAsArrayOf(parseAsString).withDefault([]),
    },
    { shallow: false },
  );

  // PRIORITY handlers
  function addPriorityFilter(p: string) {
    if (!filters.priority.includes(p))
      setFilters({ priority: [...filters.priority, p] });
  }
  function removePriorityFilter(p: string) {
    setFilters({ priority: filters.priority.filter((x) => x !== p) });
  }

  // STATUS handlers (Blocker 3: concrete, explicit handlers for each dimension)
  function addStatusFilter(s: string) {
    if (!filters.status.includes(s))
      setFilters({ status: [...filters.status, s] });
  }
  function removeStatusFilter(s: string) {
    setFilters({ status: filters.status.filter((x) => x !== s) });
  }

  // DUE handlers (Blocker 3)
  function addDueFilter(d: string) {
    if (!filters.due.includes(d)) setFilters({ due: [...filters.due, d] });
  }
  function removeDueFilter(d: string) {
    setFilters({ due: filters.due.filter((x) => x !== d) });
  }

  // PROJECT handlers (Blocker 3)
  function addProjectFilter(pid: string) {
    if (!filters.project.includes(pid))
      setFilters({ project: [...filters.project, pid] });
  }
  function removeProjectFilter(pid: string) {
    setFilters({ project: filters.project.filter((x) => x !== pid) });
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
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {/* PRIORITY chips */}
      {filters.priority.map((p) => (
        <ChipPill
          key={`pri-${p}`}
          label={`Priority: ${p}`}
          onRemove={() => removePriorityFilter(p)}
        />
      ))}

      {/* STATUS chips (Blocker 3) */}
      {filters.status.map((s) => (
        <ChipPill
          key={`sta-${s}`}
          label={`Status: ${s}`}
          onRemove={() => removeStatusFilter(s)}
        />
      ))}

      {/* DUE chips (Blocker 3) */}
      {filters.due.map((d) => (
        <ChipPill
          key={`due-${d}`}
          label={dueLabel(d)}
          onRemove={() => removeDueFilter(d)}
        />
      ))}

      {/* PROJECT chips (Blocker 3) */}
      {filters.project.map((pid) => (
        <ChipPill
          key={`prj-${pid}`}
          label={`Project: ${projectName(pid)}`}
          onRemove={() => removeProjectFilter(pid)}
        />
      ))}

      {/* + Filter dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="min-h-8 font-[family-name:var(--font-sans)] text-[12px] focus-visible:[box-shadow:var(--ring-focus)]">
            + Filter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="font-sans text-[13px]">
            Add filter
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Priority submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="font-sans text-[13px]">
              Priority
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  disabled={filters.priority.includes(p)}
                  onClick={() => addPriorityFilter(p)}
                  className="font-sans text-[13px]"
                >
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Status submenu (Blocker 3: concrete, not stub) */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="font-sans text-[13px]">
              Status
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  disabled={filters.status.includes(s)}
                  onClick={() => addStatusFilter(s)}
                  className="font-sans text-[13px]"
                >
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Due submenu (Blocker 3) */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="font-sans text-[13px]">
              Due
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {DUE_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  disabled={filters.due.includes(o.value)}
                  onClick={() => addDueFilter(o.value)}
                  className="font-sans text-[13px]"
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Project submenu (Blocker 3) */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="font-sans text-[13px]">
              Project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[260px] overflow-auto">
              {projects.length === 0 ? (
                <DropdownMenuItem
                  disabled
                  className="font-sans text-[13px] italic"
                >
                  No projects yet
                </DropdownMenuItem>
              ) : (
                projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    disabled={filters.project.includes(p.id)}
                    onClick={() => addProjectFilter(p.id)}
                    className="font-sans text-[13px]"
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear all filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-8 font-[family-name:var(--font-sans)] text-[12px] text-[var(--deck-ink-dull)] focus-visible:[box-shadow:var(--ring-focus)]"
          onClick={() =>
            setFilters({ priority: [], status: [], due: [], project: [] })
          }
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function ChipPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  // Per UI-SPEC §Filter Chip Pills active chip:
  // bg primary, text primary-foreground, rounded-full, px-3 py-1, font-sans 13px, X icon ml-1
  return (
    <span className="inline-flex min-h-7 items-center rounded-[0.375rem] bg-[var(--deck-selected)] px-2.5 py-1 font-[family-name:var(--font-sans)] text-[12px] text-[var(--deck-ink)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="ml-1 rounded p-0.5 hover:opacity-70 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <X size={13} />
      </button>
    </span>
  );
}
