"use client";

import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X } from "lucide-react";
import * as React from "react";

interface ProjectOption {
  id: string;
  name: string;
  icon?: string | null;
  isClass: boolean;
  courseCode: string | null;
}

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  projects: ProjectOption[];
}

export function ProjectAutocomplete({ value, onChange, projects }: Props) {
  const [open, setOpen] = React.useState(false);

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

  const selected = projects.filter((p) => value.includes(p.id));

  return (
    <div className="flex flex-col gap-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((p) => (
            <span
              key={p.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-[13px]",
                "backdrop-blur-md border border-[var(--edge-hud)] text-[var(--ink)]",
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

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-sans text-[13px] h-8"
          >
            {selected.length === 0 ? "Link projects..." : `${selected.length} linked`}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search projects..." className="font-sans text-[13px]" />
            <CommandList>
              <CommandEmpty className="font-sans text-[13px] py-6 text-center">
                No projects found.
              </CommandEmpty>
              <CommandGroup>
                {projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={getLabel(p)}
                    onSelect={() => toggle(p.id)}
                    className="font-sans text-[13px]"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value.includes(p.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {p.icon ? (
                      <DynamicIcon
                        name={p.icon}
                        size={14}
                        strokeWidth={1.5}
                        className="mr-1.5 text-[var(--ink-muted)] shrink-0"
                      />
                    ) : null}
                    {getLabel(p)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
