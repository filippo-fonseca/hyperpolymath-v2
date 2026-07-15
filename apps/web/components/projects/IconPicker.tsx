"use client";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Folder } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { CURATED_ICONS, type CuratedIconName, ICON_CATEGORIES } from "./icon-registry";

interface Props {
  value: string | null;
  onChange: (iconName: string | null) => void;
  /**
   * Optional custom trigger (used with PopoverTrigger `asChild`). When omitted,
   * the default bordered form-field button renders — appropriate inside dialogs.
   * ProjectHeader passes a borderless Notion-style inline trigger. Must be a
   * single focusable element (e.g. a <button>) so Radix can forward its props.
   */
  renderTrigger?: ReactNode;
}

/**
 * Lucide icon picker — 150 curated icons, categorized + searchable. Restyled to
 * the Spacedrive register (SD3): --sd-* surface + hover/selected tokens, single
 * cyan accent ring. Search is case-insensitive substring match on icon name.
 * WHY static curated map: see PITFALLS Pitfall 5 — no dynamicIconImports overhead.
 */
export function IconPicker({ value, onChange, renderTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ICON_CATEGORIES;
    return Object.fromEntries(
      Object.entries(ICON_CATEGORIES)
        .map(([cat, icons]) => [cat, icons.filter((name) => name.toLowerCase().includes(q))])
        .filter(([, icons]) => (icons as CuratedIconName[]).length > 0)
    ) as Record<string, CuratedIconName[]>;
  }, [search]);

  const handleSelect = useCallback(
    (iconName: string) => {
      onChange(iconName === value ? null : iconName);
      setOpen(false);
      setSearch("");
    },
    [onChange, value]
  );

  const SelectedIcon = value ? CURATED_ICONS[value as CuratedIconName] : null;
  const selectedEmoji = value && !SelectedIcon ? value : null;

  const handleEmojiChange = useCallback(
    (raw: string) => {
      const emoji = Array.from(raw.trim()).slice(0, 2).join("");
      onChange(emoji || null);
    },
    [onChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {renderTrigger ?? (
          <button
            type="button"
            aria-label={value ? `${value} icon (click to change)` : "Pick an icon"}
            className={cn(
              "flex items-center justify-center h-9 w-9 rounded-md border border-[var(--sd-line)]",
              "bg-[var(--sd-input)] hover:bg-[var(--sd-hover)] transition-colors text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
            )}
          >
            {SelectedIcon ? (
              <SelectedIcon size={18} />
            ) : selectedEmoji ? (
              <span className="text-[18px] leading-none">{selectedEmoji}</span>
            ) : (
              <Folder size={18} />
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-0 border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--sd-ink)]"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {/* Emoji + Search */}
        <div className="p-2 border-b border-[var(--sd-line)] space-y-2">
          <div className="flex items-center gap-2">
            <Input
              aria-label="Emoji"
              placeholder="🎓"
              value={selectedEmoji ?? ""}
              onChange={(e) => handleEmojiChange(e.target.value)}
              className="h-8 w-12 text-center text-[16px]"
            />
            <span className="font-sans text-[11px] text-[var(--sd-ink-faint)]">
              Type or paste an emoji
            </span>
          </div>
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
              <p className="font-sans text-[11px] uppercase tracking-widest text-[var(--sd-ink-faint)] px-1 mb-1">
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
                        "hover:bg-[var(--sd-hover)]",
                        isSelected &&
                          "bg-[var(--sd-selected)] ring-1 ring-inset ring-[var(--sd-accent)]"
                      )}
                    >
                      <Icon
                        size={20}
                        className={isSelected ? "text-[var(--sd-accent)]" : "text-[var(--sd-ink)]"}
                      />
                      <span className="font-sans text-[10px] text-[var(--sd-ink-faint)] truncate w-full text-center leading-tight">
                        {iconName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {Object.keys(filteredCategories).length === 0 && (
            <p className="font-sans text-[13px] text-[var(--sd-ink-faint)] text-center py-6">
              No icons match &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
