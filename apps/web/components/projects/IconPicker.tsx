"use client";

import { useState, useMemo, useCallback } from "react";
import { Folder } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CURATED_ICONS, ICON_CATEGORIES, type CuratedIconName } from "./icon-registry";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (iconName: string | null) => void;
}

/**
 * Lucide icon picker — 150 curated icons, categorized + searchable.
 * Per UI-SPEC §Icon Picker: 6-col grid, hover bg-secondary, selected bg-accent/20 border-accent.
 * Search is case-insensitive substring match on icon name across all categories.
 * WHY static curated map: see PITFALLS Pitfall 5 — no dynamicIconImports overhead.
 */
export function IconPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ICON_CATEGORIES;
    return Object.fromEntries(
      Object.entries(ICON_CATEGORIES)
        .map(([cat, icons]) => [
          cat,
          icons.filter((name) => name.toLowerCase().includes(q)),
        ])
        .filter(([, icons]) => (icons as CuratedIconName[]).length > 0),
    ) as Record<string, CuratedIconName[]>;
  }, [search]);

  const handleSelect = useCallback(
    (iconName: string) => {
      onChange(iconName === value ? null : iconName);
      setOpen(false);
      setSearch("");
    },
    [onChange, value],
  );

  const SelectedIcon = value ? CURATED_ICONS[value as CuratedIconName] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? `${value} icon (click to change)` : "Pick an icon"}
          className={cn(
            "flex items-center justify-center h-9 w-9 rounded-md border border-input",
            "bg-input hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {SelectedIcon ? (
            <SelectedIcon size={18} />
          ) : (
            <Folder size={18} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {/* Search */}
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-[13px]"
            autoFocus
          />
        </div>

        {/* Icon grid */}
        <div className="max-h-[320px] overflow-y-auto p-2">
          {Object.entries(filteredCategories).map(([category, icons]) => (
            <div key={category} className="mb-3 last:mb-0">
              <p className="font-sans text-[11px] uppercase tracking-widest text-muted-foreground px-1 mb-1">
                {category}
              </p>
              <div className="grid grid-cols-6 gap-0.5">
                {icons.map((iconName) => {
                  const Icon = CURATED_ICONS[iconName];
                  const isSelected = value === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      aria-label={`${iconName} icon`}
                      title={iconName}
                      onClick={() => handleSelect(iconName)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md p-1.5 transition-colors",
                        "hover:bg-secondary",
                        isSelected &&
                          "bg-accent/20 ring-1 ring-inset ring-accent",
                      )}
                    >
                      <Icon size={20} className={isSelected ? "text-accent-foreground" : "text-foreground"} />
                      <span className="font-sans text-[10px] text-muted-foreground truncate w-full text-center leading-tight">
                        {iconName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {Object.keys(filteredCategories).length === 0 && (
            <p className="font-sans text-[13px] text-muted-foreground text-center py-6">
              No icons match &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
