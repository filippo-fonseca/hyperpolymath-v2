"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InlineProjectCreateForm,
  type InlineProjectArea,
} from "@/components/shared/InlineProjectCreateForm";
import { cn } from "@/lib/utils";

export interface ProjectMultiSelectOption {
  id: string;
  name: string;
  isClass: boolean;
  courseCode: string | null;
}

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  projects: ProjectMultiSelectOption[];
  placeholder?: string;
  /**
   * Areas a new project can be filed under. When provided alongside
   * `onCreateProject`, the dropdown gains a "+ Create new project" row.
   */
  areas?: InlineProjectArea[];
  /** Creates a project inline; resolves to the new id, or null on failure. */
  onCreateProject?: (input: { name: string; areaId: string }) => Promise<string | null>;
}

/**
 * Multi-select project picker for capture composer (Blocker 4 fix — wires CAPT-07 UI path).
 *
 * Renders selected projects as chips above a Popover trigger; trigger opens a Checkbox
 * dropdown checklist with a search input. NOT the inline `$project` chip syntax — that
 * lands in Phase 5 (Kiwi). For Phase 2 captures, this simpler Popover variant is enough.
 */
export function ProjectMultiSelect({
  value,
  onChange,
  projects,
  placeholder = "Link to projects",
  areas,
  onCreateProject,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const canCreate = !!onCreateProject && !!areas && areas.length > 0;

  const selectedProjects = projects.filter((p) => value.includes(p.id));
  const q = query.toLowerCase();
  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.courseCode?.toLowerCase().includes(q) ?? false),
  );

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function displayName(p: ProjectMultiSelectOption) {
    return p.isClass && p.courseCode ? `${p.courseCode} ${p.name}` : p.name;
  }

  return (
    <div className="flex flex-col gap-2">
      {selectedProjects.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedProjects.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 font-sans text-[13px] bg-secondary text-foreground rounded-md px-2 py-0.5"
            >
              {displayName(p)}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-label={`Remove ${displayName(p)}`}
                className="hover:opacity-70"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCreating(false);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="font-sans text-[13px] text-muted-foreground hover:text-foreground justify-start gap-1 px-1 h-auto py-1"
          >
            <Plus size={13} />
            {selectedProjects.length === 0
              ? placeholder
              : "Add another project"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0 w-[280px]">
          {creating && canCreate ? (
            <InlineProjectCreateForm
              areas={areas!}
              onCreate={onCreateProject!}
              onDone={(newId) => {
                if (!value.includes(newId)) onChange([...value, newId]);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <>
              <div className="p-2 border-b border-border">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="h-8 font-sans text-[13px]"
                  autoFocus
                />
              </div>
              <div className="max-h-[240px] overflow-auto py-1">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 font-sans text-[13px] text-muted-foreground italic">
                    No projects found.
                  </div>
                ) : (
                  filtered.map((p) => {
                    const checked = value.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-secondary font-sans text-[13px]",
                          checked && "bg-secondary/50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(p.id)}
                        />
                        <span className="truncate">{displayName(p)}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {canCreate && (
                <div className="border-t border-border p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 font-sans text-[13px] h-8"
                    onClick={() => setCreating(true)}
                  >
                    <Plus size={13} className="text-muted-foreground" />
                    Create new project
                  </Button>
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
