"use client";

import { Check, ExternalLink, Link2, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { normalizeUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * Notion-style "URL" property field (issue #101) — shared across the task,
 * capture, and page detail/edit surfaces.
 *
 * - When a URL is set and not editing: renders it as a clickable link that opens
 *   in a new tab (`rel="noopener noreferrer"`), with an inline edit affordance.
 * - When empty (and not editing): a muted "Add a link…" trigger.
 * - Editing: a small text input. On commit (Enter / blur / ✓) the value is
 *   normalized via `normalizeUrl` (prepends https://, validates http(s), empty →
 *   null) and handed back through `onChange`. Esc cancels.
 *
 * `value` is the stored, already-normalized href (or null). The parent owns the
 * persistence — this component only edits the in-memory value, matching the
 * detail panels' draft-then-save pattern.
 */
export function UrlField({
  value,
  onChange,
  disabled,
  placeholder = "Add a link…",
  className,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  // Re-seed the draft whenever the canonical value changes (e.g. a different
  // entity loaded into the panel) while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  function startEditing() {
    if (disabled) return;
    setDraft(value ?? "");
    setEditing(true);
  }

  function commit() {
    const normalized = normalizeUrl(draft);
    onChange(normalized);
    setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Input
          // biome-ignore lint/a11y/noAutofocus: focus belongs in the just-opened editor
          autoFocus
          type="url"
          inputMode="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
          placeholder="https://example.com"
          className="font-sans text-[13px] h-8 flex-1"
          aria-label="URL"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          aria-label="Save URL"
          className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--hud-cyan)] cursor-pointer-always transition-colors duration-150"
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
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={startEditing}
        disabled={disabled}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1",
          "font-sans text-[13px] text-[var(--ink-muted)] cursor-pointer-always",
          "border border-dashed border-[var(--edge)] hover:border-[var(--edge-hud)] hover:text-[var(--ink)]",
          "transition-colors duration-150 ease-out disabled:opacity-40",
          className,
        )}
      >
        <Link2 size={13} strokeWidth={1.75} />
        {placeholder}
      </button>
    );
  }

  return (
    <div className={cn("group flex items-center gap-2 min-w-0", className)}>
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 min-w-0 max-w-full rounded-md px-2 py-1",
          "font-sans text-[13px] text-[var(--hud-cyan)] cursor-pointer-always",
          "border border-[color-mix(in_oklch,var(--hud-cyan)_35%,transparent)]",
          "hover:bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)]",
          "transition-colors duration-150 ease-out",
        )}
      >
        <ExternalLink size={13} strokeWidth={1.75} className="shrink-0" />
        <span className="truncate">{displayUrl(value)}</span>
      </a>
      <button
        type="button"
        onClick={startEditing}
        disabled={disabled}
        aria-label="Edit URL"
        title="Edit URL"
        className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer-always transition-colors duration-150 disabled:opacity-40"
      >
        <Pencil size={13} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={disabled}
        aria-label="Remove URL"
        title="Remove URL"
        className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-coral)] cursor-pointer-always transition-colors duration-150 disabled:opacity-40"
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Strip the scheme for a tidier display label, keeping the full href on click. */
function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
