"use client";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

interface Props {
  /** The project's current parent area — highlighted + checked in the list. */
  currentAreaId: string;
  /** All active areas the project can be moved into. */
  areas: { id: string; name: string }[];
  /** Fires only when a DIFFERENT area is picked. */
  onSelect: (areaId: string) => void;
  /**
   * Custom trigger (used with PopoverTrigger `asChild`). Must be a single
   * focusable element so Radix can forward its props — ProjectHeader passes the
   * inline area badge button.
   */
  renderTrigger: ReactNode;
}

/**
 * Parent-area picker for the project detail badge. Mirrors IconPicker's
 * interaction grammar (Radix Popover, search Input, --sd-* surface + hover /
 * selected tokens, single cyan accent) so the two inline "click-to-change"
 * controls read as one family. Case-insensitive substring match on area name.
 */
export function AreaPicker({ currentAreaId, areas, onSelect, renderTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter((a) => a.name.toLowerCase().includes(q));
  }, [areas, search]);

  function handleSelect(areaId: string) {
    setOpen(false);
    setSearch("");
    if (areaId !== currentAreaId) onSelect(areaId);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>{renderTrigger}</PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--sd-ink)]"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-2 border-b border-[var(--sd-line)]">
          <Input
            placeholder="Search areas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-[13px]"
            autoFocus
          />
        </div>

        <div
          className="max-h-[280px] overflow-y-auto p-1.5"
          role="listbox"
          aria-label="Move project to area"
        >
          {filtered.map((a) => {
            const isSelected = a.id === currentAreaId;
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(a.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  "font-sans text-[13px] text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]",
                  isSelected && "bg-[var(--sd-selected)]"
                )}
              >
                <span className="min-w-0 truncate">{a.name}</span>
                {isSelected ? (
                  <Check size={14} className="shrink-0 text-[var(--sd-accent)]" />
                ) : null}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--sd-ink-faint)] text-center py-6">
              No areas match &ldquo;{search}&rdquo;
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
