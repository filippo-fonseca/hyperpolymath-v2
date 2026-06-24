"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineProjectCreateForm } from "@/components/shared/InlineProjectCreateForm";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { Check, Lock, Plus } from "lucide-react";
import { useState } from "react";

interface InheritedLink {
  projectId: string;
  sourceFolderName: string;
}

interface ProjectLinkerProps {
  /** Areas + their projects, from getSidebarTreeForCurrentUser(). */
  areas: SidebarArea[];
  /** Direct project ids on this element (editable, togglable). */
  selectedProjectIds: string[];
  /** Inherited links (read-only). Rendered above the editable list, never togglable. */
  inheritedLinks?: InheritedLink[];
  /** Fired when a non-inherited project is toggled. `next` is the desired state. */
  onToggle: (projectId: string, next: boolean) => void;
  /** Trigger pill label. Defaults to "Link project". */
  triggerLabel?: string;
  /**
   * Creates a project inline; resolves to the new id, or null on failure. When
   * provided the popover gains a "+ Create new project" row that files the new
   * project under a chosen area and links it to this page.
   */
  onCreateProject?: (input: { name: string; areaId: string }) => Promise<string | null>;
}

/**
 * Searchable, Area-grouped project multi-select shared by the page linker and
 * the folder linker (Phase 24). The trigger is the existing dashed "+ Link
 * project" pill; the content uses the cmdk Command primitive with one group per
 * Area (heading = emoji + name) and projects as checkable items.
 *
 * Inherited links (links that live on an ancestor folder and cascade down)
 * render in a read-only section at the top: locked, muted, captioned "inherited
 * from {sourceFolderName}", and never togglable. The component never sends an
 * inherited id to `onToggle` — inheritance enforcement lives here in the UI and
 * in the server's owner checks.
 */
export function ProjectLinker({
  areas,
  selectedProjectIds,
  inheritedLinks = [],
  onToggle,
  triggerLabel = "Link project",
  onCreateProject,
}: ProjectLinkerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const canCreate = !!onCreateProject && areas.length > 0;

  const selected = new Set(selectedProjectIds);
  // A project already inherited is locked: it cannot also be toggled as a direct
  // link, so we hide it from the editable list and only show it as read-only.
  const inheritedSet = new Set(inheritedLinks.map((l) => l.projectId));

  // Resolve inherited project ids to names for the read-only caption.
  const projectName = new Map<string, string>();
  for (const area of areas) {
    for (const project of area.projects) projectName.set(project.id, project.name);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[12px] font-mono text-[var(--ink-muted)] border border-dashed border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
        >
          <Plus size={10} strokeWidth={2} />
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {creating && canCreate ? (
          <InlineProjectCreateForm
            areas={areas.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }))}
            onCreate={onCreateProject!}
            onDone={(newId) => {
              onToggle(newId, true);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <>
        {inheritedLinks.length > 0 && (
          <div className="flex flex-col gap-1 border-b border-[var(--edge)] p-2">
            <p className="px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Inherited
            </p>
            {inheritedLinks.map((link) => (
              <div
                key={link.projectId}
                title={`Inherited from ${link.sourceFolderName}`}
                className="flex items-center gap-2 px-1 py-1 rounded-sm text-[12px] font-mono text-[var(--ink-muted)] opacity-70"
              >
                <Lock size={11} strokeWidth={1.5} className="flex-shrink-0" />
                <span className="truncate">
                  {projectName.get(link.projectId) ?? "Project"}
                </span>
                <span className="ml-auto flex-shrink-0 text-[10px] italic">
                  from {link.sourceFolderName}
                </span>
              </div>
            ))}
          </div>
        )}
        <Command className="bg-transparent">
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            {areas.map((area) => {
              const linkable = area.projects.filter((p) => !inheritedSet.has(p.id));
              if (linkable.length === 0) return null;
              return (
                <CommandGroup
                  key={area.id}
                  heading={`${area.emoji ?? ""} ${area.name}`.trim()}
                >
                  {linkable.map((project) => {
                    const isSelected = selected.has(project.id);
                    return (
                      <CommandItem
                        key={project.id}
                        value={`${area.name} ${project.name}`}
                        onSelect={() => onToggle(project.id, !isSelected)}
                      >
                        <span className="truncate">{project.name}</span>
                        {isSelected && (
                          <Check
                            size={13}
                            strokeWidth={2}
                            className="ml-auto flex-shrink-0 text-[var(--ink)]"
                          />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
        {canCreate && (
          <div className="border-t border-[var(--edge)] p-1">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] font-mono text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors duration-150 cursor-pointer"
            >
              <Plus size={11} strokeWidth={2} className="flex-shrink-0" />
              Create new project
            </button>
          </div>
        )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
