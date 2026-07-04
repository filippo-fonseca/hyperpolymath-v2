"use client";

/**
 * BlockEditor — the heart of routine authoring. Two modes:
 *
 *  1. Picking a capability: a grid of tappable cards from the curated
 *     BLOCK_CATALOG (icon + label + one-line description). No raw tool names.
 *  2. Writing the directive: once a capability is chosen, the NL-directive
 *     textarea appears — plain English is what makes each block smart.
 *
 * For `open_workspace`, the directive textarea is REPLACED by a rows editor
 * (App|URL, value, optional label, fullscreen toggle). This block's params
 * carry the list of items to open; the block has no NL directive.
 *
 * On confirm it emits a RoutineBlock (fresh uuid, chosen tool, directive OR
 * params.items). Used both to add a new block and to edit an existing one
 * (prefilled).
 */

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import type { RoutineBlock } from "@hyperpolymath/jarvis-core";
import type { JarvisToolName } from "@hyperpolymath/jarvis-core";
import { BLOCK_CATALOG, catalogEntry, type BlockCatalogEntry } from "./block-catalog";

interface Props {
  /** When editing an existing block; absent = adding a new one. */
  initial?: RoutineBlock;
  onConfirm: (block: RoutineBlock) => void;
  onCancel: () => void;
}

// UI-side row shape. Strings are non-optional in state to keep inputs
// controlled; we normalize to the persisted schema (label/fullscreen omitted
// when empty/false) inside confirm().
interface WorkspaceRow {
  type: "url" | "app";
  value: string;
  label: string;
  fullscreen: boolean;
}

/**
 * Defensively narrow the persisted params.items array back into UI rows. Any
 * shape drift (missing type, non-string value, etc.) drops the offending row
 * — an editor round-trip never surfaces a garbled row.
 */
function readWorkspaceRows(block?: RoutineBlock): WorkspaceRow[] {
  const raw = block?.params?.["items"];
  if (!Array.isArray(raw)) return [{ type: "app", value: "", label: "", fullscreen: false }];
  const rows: WorkspaceRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const t = e["type"];
    const v = e["value"];
    if ((t !== "url" && t !== "app") || typeof v !== "string") continue;
    rows.push({
      type: t,
      value: v,
      label: typeof e["label"] === "string" ? (e["label"] as string) : "",
      fullscreen: e["fullscreen"] === true,
    });
  }
  return rows.length > 0 ? rows : [{ type: "app", value: "", label: "", fullscreen: false }];
}

export function BlockEditor({ initial, onConfirm, onCancel }: Props) {
  const initialEntry = initial ? catalogEntry(initial.tool) : undefined;
  const [selected, setSelected] = useState<BlockCatalogEntry | undefined>(
    initialEntry,
  );
  const [directive, setDirective] = useState(initial?.nlDirective ?? "");
  const initialRows = useMemo(() => readWorkspaceRows(initial), [initial]);
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>(initialRows);

  const isWorkspace = selected?.tool === "open_workspace";

  function choose(entry: BlockCatalogEntry) {
    setSelected(entry);
    // Prefill the directive from the catalog default when adding fresh.
    if (!initial) setDirective(entry.defaultDirective ?? "");
  }

  function updateRow(idx: number, patch: Partial<WorkspaceRow>) {
    setWorkspaceRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setWorkspaceRows((rows) => [
      ...rows,
      { type: "app", value: "", label: "", fullscreen: false },
    ]);
  }

  function removeRow(idx: number) {
    setWorkspaceRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
  }

  const cleanedWorkspaceItems = useMemo(() => {
    return workspaceRows
      .filter((r) => r.value.trim().length > 0)
      .map((r) => {
        const item: {
          type: "url" | "app";
          value: string;
          label?: string;
          fullscreen?: boolean;
        } = { type: r.type, value: r.value.trim() };
        if (r.label.trim().length > 0) item.label = r.label.trim();
        if (r.fullscreen) item.fullscreen = true;
        return item;
      });
  }, [workspaceRows]);

  function confirm() {
    if (!selected) return;
    if (isWorkspace && cleanedWorkspaceItems.length === 0) return;
    onConfirm({
      id: initial?.id ?? crypto.randomUUID(),
      tool: selected.tool as JarvisToolName,
      params: isWorkspace ? { items: cleanedWorkspaceItems } : (initial?.params ?? {}),
      // open_workspace carries no directive; the params list IS the block.
      nlDirective: isWorkspace ? undefined : directive.trim() ? directive.trim() : undefined,
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

        {isWorkspace ? (
          <div>
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              Items to open
            </label>
            <div className="mt-2 space-y-2">
              {workspaceRows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] p-2"
                >
                  <div className="inline-flex overflow-hidden rounded-md border border-[var(--edge)]">
                    <button
                      type="button"
                      onClick={() => updateRow(idx, { type: "app" })}
                      className={`font-mono text-[11px] uppercase tracking-[0.06em] px-2 py-1 transition-colors duration-100 ${
                        row.type === "app"
                          ? "bg-[var(--ink)] text-[var(--canvas)]"
                          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      App
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRow(idx, { type: "url" })}
                      className={`font-mono text-[11px] uppercase tracking-[0.06em] px-2 py-1 transition-colors duration-100 ${
                        row.type === "url"
                          ? "bg-[var(--ink)] text-[var(--canvas)]"
                          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      URL
                    </button>
                  </div>
                  <input
                    value={row.value}
                    onChange={(e) => updateRow(idx, { value: e.target.value })}
                    placeholder={row.type === "app" ? "Arc" : "https://mail.google.com"}
                    className="min-w-[10rem] flex-1 rounded-md border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1 font-serif text-[14px] text-[var(--ink)] outline-none focus:border-[var(--hud-cyan)] transition-colors duration-100"
                  />
                  <input
                    value={row.label}
                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                    placeholder="label (optional)"
                    className="w-[10rem] rounded-md border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1 font-serif text-[13px] text-[var(--ink-muted)] outline-none focus:border-[var(--hud-cyan)] focus:text-[var(--ink)] transition-colors duration-100"
                  />
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    <input
                      type="checkbox"
                      checked={row.fullscreen}
                      onChange={(e) => updateRow(idx, { fullscreen: e.target.checked })}
                      className="h-3.5 w-3.5 accent-[var(--hud-cyan)]"
                    />
                    Fullscreen
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={workspaceRows.length <= 1}
                    aria-label="Remove item"
                    className="rounded-md border border-[var(--edge)] p-1 text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--edge)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:border-[var(--hud-cyan)] hover:text-[var(--ink)] transition-colors duration-100"
              >
                <Plus size={12} />
                Add item
              </button>
            </div>
            <p className="mt-2 font-serif text-[12px] leading-[1.5] text-[var(--ink-muted)]">
              Each item opens when this routine runs. Apps use the /Applications
              name (Arc, WhatsApp, Warp, Spark). Fullscreen is best-effort.
            </p>
          </div>
        ) : (
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
        )}

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
            disabled={isWorkspace && cleanedWorkspaceItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-100"
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
