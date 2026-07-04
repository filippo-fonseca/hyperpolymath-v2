"use client";

/**
 * BlockEditor — the heart of routine authoring. Two modes:
 *
 *  1. Picking a capability: a grid of tappable cards from the curated
 *     BLOCK_CATALOG (icon + label + one-line description). No raw tool names.
 *  2. Writing the directive: once a capability is chosen, the NL-directive
 *     textarea appears — plain English is what makes each block smart.
 *
 * On confirm it emits a RoutineBlock (fresh uuid, chosen tool, directive). Used
 * both to add a new block and to edit an existing one (prefilled).
 */

import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";
import type { JarvisToolName } from "@hyperpolymath/jarvis-core";
import { BLOCK_CATALOG, catalogEntry, type BlockCatalogEntry } from "./block-catalog";

interface Props {
  /** When editing an existing block; absent = adding a new one. */
  initial?: RoutineBlock;
  onConfirm: (block: RoutineBlock) => void;
  onCancel: () => void;
}

export function BlockEditor({ initial, onConfirm, onCancel }: Props) {
  const initialEntry = initial ? catalogEntry(initial.tool) : undefined;
  const [selected, setSelected] = useState<BlockCatalogEntry | undefined>(
    initialEntry,
  );
  const [directive, setDirective] = useState(initial?.nlDirective ?? "");
  // Per-block loading chatter: a spoken filler line the runner interprets while
  // the block gathers. Optional and off by default; toggle reveals the textarea.
  const [chatterEnabled, setChatterEnabled] = useState<boolean>(
    Boolean(initial?.loadingInstruction && initial.loadingInstruction.length > 0),
  );
  const [loadingInstruction, setLoadingInstruction] = useState(
    initial?.loadingInstruction ?? "",
  );

  function choose(entry: BlockCatalogEntry) {
    setSelected(entry);
    // Prefill the directive from the catalog default when adding fresh.
    if (!initial) setDirective(entry.defaultDirective ?? "");
  }

  function confirm() {
    if (!selected) return;
    const trimmedChatter = loadingInstruction.trim();
    onConfirm({
      id: initial?.id ?? crypto.randomUUID(),
      tool: selected.tool as JarvisToolName,
      params: initial?.params ?? {},
      nlDirective: directive.trim() ? directive.trim() : undefined,
      loadingInstruction: chatterEnabled && trimmedChatter ? trimmedChatter : undefined,
    });
  }

  // --- Directive step ------------------------------------------------------
  if (selected) {
    const Icon = selected.icon;
    return (
      <div className="glass-tile space-y-4 rounded-xl p-5">
        <div className="flex items-center gap-3">
          {!initial ? (
            <button
              type="button"
              onClick={() => setSelected(undefined)}
              className="rounded-md border border-[var(--edge)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] transition-colors duration-100"
              aria-label="Back to capabilities"
            >
              <ArrowLeft size={14} />
            </button>
          ) : null}
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="font-serif text-lg text-[var(--ink)]">{selected.label}</p>
            <p className="font-serif text-[13px] text-[var(--ink-muted)]">
              {selected.description}
            </p>
          </div>
        </div>

        <div>
          <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            Tell JARVIS what to do with this
          </label>
          <textarea
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            placeholder={selected.directivePlaceholder}
            rows={3}
            maxLength={2000}
            autoFocus
            className="mt-2 w-full resize-y rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 font-serif text-[15px] leading-[1.5] text-[var(--ink)] outline-none focus:border-[var(--hud-cyan)] transition-colors duration-100"
          />
          <p className="mt-1.5 font-serif text-[12px] leading-[1.5] text-[var(--ink-muted)]">
            Plain English. This is what makes the block yours — be specific about
            what to include, filter, and hand back.
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={chatterEnabled}
              onChange={(e) => setChatterEnabled(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--hud-cyan)]"
            />
            Speak while loading
          </label>
          {chatterEnabled ? (
            <>
              <textarea
                value={loadingInstruction}
                onChange={(e) => setLoadingInstruction(e.target.value)}
                placeholder="what jarvis says while this block fetches — e.g. 'let sir know you're checking the inbox for anything urgent'"
                rows={2}
                maxLength={2000}
                className="mt-2 w-full resize-y rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 font-serif text-[15px] leading-[1.5] text-[var(--ink)] outline-none focus:border-[var(--hud-cyan)] transition-colors duration-100"
              />
              <p className="mt-1.5 font-serif text-[12px] leading-[1.5] text-[var(--ink-muted)]">
                Instructions, not a script. JARVIS interprets these into a fresh
                spoken line every run so it never sounds canned.
              </p>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] hover:opacity-90 transition-opacity duration-100"
          >
            <Check size={14} />
            {initial ? "Save block" : "Add block"}
          </button>
        </div>
      </div>
    );
  }

  // --- Capability-picker step ----------------------------------------------
  return (
    <div className="glass-tile space-y-3 rounded-xl p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
          Pick a capability
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BLOCK_CATALOG.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.tool}
              type="button"
              onClick={() => choose(entry)}
              className="glass-button flex flex-col items-start gap-1.5 rounded-lg p-3 text-left transition-transform duration-100 hover:-translate-y-0.5"
            >
              <Icon className="h-4 w-4 text-[var(--ink-amber)]" />
              <span className="font-serif text-[15px] font-medium text-[var(--ink)]">
                {entry.label}
              </span>
              <span className="font-serif text-[12px] leading-[1.4] text-[var(--ink-muted)]">
                {entry.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
