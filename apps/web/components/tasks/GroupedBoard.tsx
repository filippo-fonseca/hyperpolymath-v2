"use client";

import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { TaskCard } from "./TaskCard";
import type { TaskGroup } from "./TasksClient";

interface Props {
  groups: TaskGroup[];
  onTaskClick: (id: string) => void;
}

/**
 * Board view segmented by project or area (`?group=project|area`).
 *
 * One column per group, spanning the whole filtered set rather than a single
 * day: segmentation answers "what is on this project", which is not a per-day
 * question. Multi-project tasks appear once under each project they belong
 * to; zero-project tasks land in the "No project" group pinned last (the rule
 * is stated in the unit report).
 *
 * Deliberately drag-free: dragging a card between group columns would rewrite
 * project links, a mutation with many-to-many semantics that a drop cannot
 * express calmly. Cards stay clickable; edits happen in the detail panel.
 */
export function GroupedBoard({ groups, onTaskClick }: Props) {
  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-4">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-label={group.label}
          className="flex w-[280px] shrink-0 flex-col rounded-xl bg-[var(--surface)]"
        >
          {/* Quiet Craft section label (craft-ui-v2): text-micro gray with
              the count beside it, matching the kanban column headers. */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <h3 className="min-w-0 truncate text-micro font-medium text-[var(--ink-muted)]">
              {group.label}
            </h3>
            <span className="shrink-0 text-micro tabular-nums text-[var(--ink-faint)]">
              {group.tasks.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {group.tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onTaskClick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
