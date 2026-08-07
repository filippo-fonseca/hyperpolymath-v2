"use client";

import { EmojiPickerPanel } from "@/components/ui/EmojiPicker";
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
  const [tab, setTab] = useState<"icons" | "emoji">("icons");

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {renderTrigger ?? (
          <button
            type="button"
            aria-label={value ? `${value} icon (click to change)` : "Pick an icon"}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border border-[var(--edge)]",
              "bg-[var(--surface)] text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out",
              "hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            )}
          >
            {SelectedIcon ? (
              <SelectedIcon size={18} />
            ) : selectedEmoji ? (
 <span className="text-subtitle leading-none">{selectedEmoji}</span>
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
        {/* Two ways to say the same thing, so neither is a cramped afterthought
            bolted onto the other: a curated Lucide set, or the shared emoji
            picker every other surface uses. */}
        <div className="flex items-center gap-1 border-b border-[var(--sd-line)] p-2">
          {(["icons", "emoji"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "h-7 flex-1 cursor-pointer rounded-lg text-meta capitalize transition-colors duration-[160ms] ease-out",
                tab === t
                  ? "bg-[var(--selected)] text-[var(--ink)]"
                  : "text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "emoji" ? (
          <EmojiPickerPanel
            value={selectedEmoji}
            onChange={(next) => {
              onChange(next);
              setOpen(false);
            }}
            onPicked={() => setOpen(false)}
          />
        ) : (
          <>
        <div className="p-2 border-b border-[var(--sd-line)]">
          <Input
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-meta text-[var(--ink)]"
            autoFocus
          />
        </div>

        {/* Icon grid */}
        <div className="max-h-[320px] overflow-y-auto p-2">
          {Object.entries(filteredCategories).map(([category, icons]) => (
            <div key={category} className="mb-3 last:mb-0">
              <p className="mb-1 px-1 font-sans text-micro font-medium text-[var(--ink-faint)]">
                {category}
              </p>
              <div className="grid grid-cols-6 gap-1">
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
                        "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors duration-[160ms] ease-out",
                        "hover:bg-[var(--hover)]",
                        isSelected &&
                          "bg-[var(--selected)] ring-1 ring-inset ring-[var(--edge-strong)]"
                      )}
                    >
                      <Icon
                        size={20}
                        className={isSelected ? "text-[var(--accent)]" : "text-[var(--ink)]"}
                      />
                      <span className="w-full truncate text-center font-sans text-micro leading-tight text-[var(--ink-faint)]">
                        {iconName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {Object.keys(filteredCategories).length === 0 && (
            <p className="py-6 text-center font-sans text-meta text-[var(--ink-faint)]">
              No icons match &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
