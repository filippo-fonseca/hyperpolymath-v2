"use client";

import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import * as React from "react";

interface ProjectOption {
  id: string;
  name: string;
  icon?: string | null;
  isClass: boolean;
  courseCode: string | null;
  areaName?: string | null;
  areaEmoji?: string | null;
}

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  projects: ProjectOption[];
  areas: { id: string; name: string; emoji: string | null }[];
  onCreateProject: (input: { name: string; areaId: string }) => Promise<string | null>;
}

export function ProjectAutocomplete({ value, onChange, projects, areas, onCreateProject }: Props) {
  const [open, setOpen] = React.useState(false);
  // Inline create (issue #34): when true the popover swaps from the project
  // list to a tiny create form (name + area). Submitting creates the project,
  // auto-selects it, and drops back to the list.
  const [creating, setCreating] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftAreaId, setDraftAreaId] = React.useState<string>(areas[0]?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  function getLabel(p: ProjectOption): string {
    if (p.isClass && p.courseCode) return `${p.courseCode} ${p.name}`;
    return p.name;
  }

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function startCreate() {
    setDraftName("");
    setDraftAreaId(areas[0]?.id ?? "");
    setCreating(true);
  }

  function cancelCreate() {
    setCreating(false);
    setDraftName("");
  }

  async function submitCreate() {
    const name = draftName.trim();
    if (!name || !draftAreaId || submitting) return;
    setSubmitting(true);
    const newId = await onCreateProject({ name, areaId: draftAreaId });
    setSubmitting(false);
    if (newId) {
      if (!value.includes(newId)) onChange([...value, newId]);
      setCreating(false);
      setDraftName("");
    }
  }

  const selected = projects.filter((p) => value.includes(p.id));
  const canCreate = areas.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((p) => (
            <span
              key={p.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-meta",
                "border border-[var(--edge-hud)] text-[var(--ink)]",
                "bg-[color:color-mix(in_oklch,var(--surface-raised)_82%,transparent)]",
                "shadow-[inset_0_1px_0_var(--glass-hi),inset_0_-1px_0_var(--glass-lo)]"
              )}
            >
              {p.icon ? (
                <DynamicIcon
                  name={p.icon}
                  size={13}
                  strokeWidth={1.5}
                  className="text-[var(--ink-muted)] shrink-0"
                />
              ) : null}
              {getLabel(p)}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
                aria-label={`Remove ${getLabel(p)}`}
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
          if (!next) cancelCreate();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-sans text-meta h-8"
          >
            {selected.length === 0 ? "Link projects..." : `${selected.length} linked`}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0">
          {creating ? (
            <div className="flex flex-col gap-2.5 p-3">
              <p className="text-micro font-medium text-[var(--ink-muted)]">New project</p>
              <Input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitCreate();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelCreate();
                  }
                }}
                placeholder="Project name"
                className="h-8 font-sans text-meta"
              />
              <Select value={draftAreaId} onValueChange={setDraftAreaId}>
                <SelectTrigger className="h-8 font-sans text-meta">
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="font-sans text-meta">
                      {`${a.emoji ?? ""} ${a.name}`.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-end gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 font-sans text-meta"
                  onClick={cancelCreate}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 font-sans text-meta"
                  onClick={() => void submitCreate()}
                  disabled={submitting || !draftName.trim() || !draftAreaId}
                >
                  {submitting ? (
                    <>
                      <Spinner size={12} label="Creating project" />
                      Creating…
                    </>
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Command>
              <CommandInput placeholder="Search projects…" className="font-sans text-meta" />
              <CommandList>
                <CommandEmpty className="font-sans text-meta py-6 text-center">
                  No projects found.
                </CommandEmpty>
                <CommandGroup className="p-1">
                  {projects.map((p) => {
                    const areaLabel = p.areaName
                      ? `${p.areaEmoji ?? ""} ${p.areaName}`.trim()
                      : "No area";
                    return (
                      <CommandItem
                        key={p.id}
                        value={`${getLabel(p)} ${p.areaName ?? ""}`}
                        onSelect={() => toggle(p.id)}
                        className="gap-2 rounded-lg px-2 py-1.5 font-sans text-meta"
                      >
                        {/* One fixed leading slot, not two. The old row kept an
                            always-rendered checkmark (opacity-0 when unselected)
                            AND an optional icon, so names started at a
                            different x on every row and every name sat ~30px
                            in from the edge for no reason. The slot now shows
                            the tick when selected and the project's own icon
                            otherwise, so the column is one width and the names
                            line up. */}
                        <span className="inline-flex size-4 shrink-0 items-center justify-center text-[var(--ink-muted)]">
                          {value.includes(p.id) ? (
                            <Check className="size-3.5 text-[var(--accent)]" strokeWidth={2.5} />
                          ) : p.icon ? (
                            <DynamicIcon name={p.icon} size={14} strokeWidth={1.5} />
                          ) : (
                            <span
                              aria-hidden
                              className="size-1.5 rounded-full bg-[var(--edge-strong)]"
                            />
                          )}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            value.includes(p.id)
                              ? "font-medium text-[var(--ink)]"
                              : "text-[var(--ink)]"
                          )}
                        >
                          {getLabel(p)}
                        </span>
                        {/* The area reads as a chip rather than a second run of
                            body text, so the eye can tell the two apart at a
                            glance instead of parsing one long line. */}
                        <span
                          className={cn(
                            "shrink-0 truncate rounded-full bg-[var(--hover)] px-1.5 py-0.5 text-micro text-[var(--ink-muted)]",
                            !p.areaName && "italic opacity-70"
                          )}
                        >
                          {areaLabel}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {canCreate && (
                  <CommandGroup className="border-t border-[var(--glass-border)]">
                    <CommandItem
                      value="__create_new_project__"
                      onSelect={startCreate}
                      className="font-sans text-meta text-[var(--ink)]"
                    >
                      <Plus className="mr-2 h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                      Create new project
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
