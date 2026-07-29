"use client";

import { Check, ExternalLink, Link2, Plus, X } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { normalizeUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * Multi-URL property field — the capture-side counterpart of the single-link
 * `UrlField`. Renders the full set of links attached to a capture (each a
 * clickable link with a remove button) plus an "Add a link…" affordance that
 * normalizes and appends. De-duplicates case-insensitively.
 *
 * Links auto-derived from the body appear here alongside manually-added ones;
 * removing a body-derived link only sticks if it's also removed from the body
 * (the server re-derives body links on every save), which matches the
 * "any link in the body stays indexed" contract.
 *
 * `value` is the stored, already-normalized set. The parent owns persistence —
 * this only edits the in-memory list, matching the detail panel's draft-then-
 * save pattern.
 */
export function UrlListField({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const normalized = normalizeUrl(draft);
    setDraft("");
    setAdding(false);
    if (!normalized) return;
    // De-dupe case-insensitively against the existing set.
    if (value.some((u) => u.toLowerCase() === normalized.toLowerCase())) return;
    onChange([...value, normalized]);
  }

  function cancel() {
    setDraft("");
    setAdding(false);
  }

  function remove(target: string) {
    onChange(value.filter((u) => u !== target));
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {value.map((href) => (
            <li key={href} className="group flex items-center gap-2 min-w-0">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-1.5 min-w-0 max-w-full rounded-lg px-2 py-1",
                  "font-sans text-[13px] text-[var(--hud-cyan)] cursor-pointer-always",
                  "border border-[color-mix(in_oklch,var(--hud-cyan)_35%,transparent)]",
                  "hover:bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)]",
                  "transition-colors duration-150 ease-out",
                )}
              >
                <ExternalLink size={13} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{displayUrl(href)}</span>
              </a>
              <button
                type="button"
                onClick={() => remove(href)}
                disabled={disabled}
                aria-label={`Remove ${displayUrl(href)}`}
                title="Remove link"
                className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-coral)] cursor-pointer-always transition-colors duration-150 disabled:opacity-40"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
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
            aria-label="Add a URL"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            aria-label="Add URL"
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
            <Link2 size={13} strokeWidth={1.75} />
          )}
          {value.length > 0 ? "Add another link…" : "Add a link…"}
        </button>
      )}
    </div>
  );
}

/** Strip the scheme for a tidier display label, keeping the full href on click. */
function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
