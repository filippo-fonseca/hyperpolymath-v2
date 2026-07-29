"use client";

import { Check, Plus, User, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PersonFieldOption {
  id: string;
  name: string;
}

/**
 * Linked-people property field — the people counterpart of `UrlListField`.
 * Renders the full set of people linked to a capture/task (each an amber chip
 * with a remove button) plus an "Add a person…" affordance that autocompletes
 * against the user's existing people and lets you type a brand-new name.
 *
 * People auto-derived from the body (the Haiku smart-match) appear here
 * alongside manually-added ones and the inline `@`-mentions. Removing a person
 * only sticks if they're also not referenced in the body — the server re-derives
 * body references on every save, mirroring the URL field's "any link in the body
 * stays indexed" contract.
 *
 * `value` is the in-memory list of linked names; the parent owns persistence
 * (draft-then-save), matching the detail panel pattern. `onChange` receives the
 * next name list, de-duplicated case-insensitively.
 */
export function PersonListField({
  value,
  onChange,
  suggestions = [],
  disabled,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** The user's existing people, for the add-autocomplete. */
  suggestions?: PersonFieldOption[];
  disabled?: boolean;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  // Existing people not already linked, filtered by the current draft. Capped
  // so the menu stays tidy. Case-insensitive substring match on the name.
  const filtered = useMemo(() => {
    const linked = new Set(value.map((n) => n.toLowerCase()));
    const q = draft.trim().toLowerCase();
    return suggestions
      .filter((p) => !linked.has(p.name.toLowerCase()))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .slice(0, 6);
  }, [suggestions, value, draft]);

  function add(name: string) {
    const clean = name.trim();
    setDraft("");
    setAdding(false);
    if (!clean) return;
    if (value.some((n) => n.toLowerCase() === clean.toLowerCase())) return;
    onChange([...value, clean]);
  }

  function cancel() {
    setDraft("");
    setAdding(false);
  }

  function remove(target: string) {
    onChange(value.filter((n) => n !== target));
  }

  const trimmed = draft.trim();
  const exactExists =
    trimmed.length > 0 &&
    (value.some((n) => n.toLowerCase() === trimmed.toLowerCase()) ||
      suggestions.some((p) => p.name.toLowerCase() === trimmed.toLowerCase()));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <li key={name} className="group inline-flex items-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1",
                  "font-sans text-[13px] text-[var(--ink-amber)]",
                  "border border-[color-mix(in_oklch,var(--ink-amber)_35%,transparent)]",
                  "bg-[color-mix(in_oklch,var(--ink-amber)_10%,transparent)]",
                )}
              >
                <User size={13} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate max-w-[220px]">{name}</span>
                <button
                  type="button"
                  onClick={() => remove(name)}
                  disabled={disabled}
                  aria-label={`Remove ${name}`}
                  title="Remove person"
                  className="rounded text-[var(--ink-muted)] hover:text-[var(--ink-coral)] cursor-pointer-always transition-colors duration-150 disabled:opacity-40"
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              // biome-ignore lint/a11y/noAutofocus: focus belongs in the just-opened editor
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(draft);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              onBlur={() => add(draft)}
              placeholder="Add a person…"
              className="font-sans text-[13px] h-8 flex-1"
              aria-label="Add a person"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(draft)}
              aria-label="Add person"
              className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-amber)] cursor-pointer-always transition-colors duration-150"
            >
              <Check size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              aria-label="Cancel"
              className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always transition-colors duration-150"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
          {(filtered.length > 0 || (trimmed.length > 0 && !exactExists)) && (
            <ul className="flex flex-col rounded-lg border border-[var(--edge)] overflow-hidden">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    // mousedown fires before the input's blur so the pick lands.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(p.name);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-sans text-[13px] text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink-amber)_12%,transparent)] cursor-pointer-always transition-colors duration-150"
                  >
                    <User size={13} strokeWidth={1.75} className="shrink-0 text-[var(--ink-amber)]" />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
              {trimmed.length > 0 && !exactExists && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(trimmed);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-sans text-[13px] text-[var(--ink-muted)] hover:bg-[color-mix(in_oklch,var(--ink-amber)_12%,transparent)] cursor-pointer-always transition-colors duration-150"
                  >
                    <UserPlus size={13} strokeWidth={1.75} className="shrink-0" />
                    <span className="truncate">
                      Create <span className="text-[var(--ink)]">{trimmed}</span>
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setAdding(true)}
          disabled={disabled}
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1",
            "font-sans text-[13px] text-[var(--ink-muted)] cursor-pointer-always",
            "border border-dashed border-[var(--edge)] hover:border-[var(--edge-hud)] hover:text-[var(--ink)]",
            "transition-colors duration-150 ease-out disabled:opacity-40",
          )}
        >
          {value.length > 0 ? (
            <Plus size={13} strokeWidth={1.75} />
          ) : (
            <UserPlus size={13} strokeWidth={1.75} />
          )}
          {value.length > 0 ? "Add another person…" : "Add a person…"}
        </button>
      )}
    </div>
  );
}
