"use client";

/**
 * BlockEditor — the heart of routine authoring (Spacedrive register). Two modes:
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
 * (prefilled). The editor sits on a recessed --sd-darker-box plate so it reads
 * as an inset within the routine's --sd-box card.
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

const PLATE_STYLE = { background: "var(--sd-darker-box)" } as const;
const FIELD_STYLE = { background: "var(--sd-input)" } as const;

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
    const trimmedChatter = loadingInstruction.trim();
    onConfirm({
      id: initial?.id ?? crypto.randomUUID(),
      tool: selected.tool as JarvisToolName,
      params: isWorkspace ? { items: cleanedWorkspaceItems } : (initial?.params ?? {}),
      // open_workspace carries no directive; the params list IS the block.
      nlDirective: isWorkspace ? undefined : directive.trim() ? directive.trim() : undefined,
      // Loading chatter is a gather-block concept; action (workspace) blocks skip it.
      loadingInstruction: isWorkspace
        ? undefined
        : chatterEnabled && trimmedChatter
          ? trimmedChatter
          : undefined,
    });
  }

  // --- Directive step ------------------------------------------------------
  if (selected) {
    const Icon = selected.icon;
    return (
      <div
        style={PLATE_STYLE}
        className="space-y-4 rounded-[12px] border border-[var(--sd-line)] p-5"
      >
        <div className="flex items-center gap-3">
          {!initial ? (
            <button
              type="button"
              onClick={() => setSelected(undefined)}
              className="rounded-[8px] border border-[var(--sd-line)] p-1.5 text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
              aria-label="Back to capabilities"
            >
              <ArrowLeft size={14} />
            </button>
          ) : null}
          <span
            style={FIELD_STYLE}
            className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[var(--sd-line)] text-[var(--sd-accent)]"
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-[var(--sd-ink)]">{selected.label}</p>
            <p className="text-[13px] text-[var(--sd-ink-dull)]">{selected.description}</p>
          </div>
        </div>

        {isWorkspace ? (
          <div>
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
              Items to open
            </label>
            <div className="mt-2 space-y-2">
              {workspaceRows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-[9px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-2"
                >
                  <div className="inline-flex overflow-hidden rounded-[7px] border border-[var(--sd-line)]">
                    {(["app", "url"] as const).map((kind) => {
                      const active = row.type === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => updateRow(idx, { type: kind })}
                          style={
                            active
                              ? { background: "color-mix(in oklch, var(--sd-accent) 16%, transparent)" }
                              : undefined
                          }
                          className={`font-mono text-[11px] uppercase tracking-[0.06em] px-2 py-1 transition-colors duration-[140ms] ${
                            active
                              ? "text-[var(--sd-accent)]"
                              : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]"
                          }`}
                        >
                          {kind === "app" ? "App" : "URL"}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={row.value}
                    onChange={(e) => updateRow(idx, { value: e.target.value })}
                    placeholder={row.type === "app" ? "Arc" : "https://mail.google.com"}
                    style={FIELD_STYLE}
                    className="min-w-[10rem] flex-1 rounded-[7px] border border-[var(--sd-line)] px-2 py-1 text-[14px] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] transition-colors duration-[140ms]"
                  />
                  <input
                    value={row.label}
                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                    placeholder="label (optional)"
                    style={FIELD_STYLE}
                    className="w-[10rem] rounded-[7px] border border-[var(--sd-line)] px-2 py-1 text-[13px] text-[var(--sd-ink-dull)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] focus:text-[var(--sd-ink)] transition-colors duration-[140ms]"
                  />
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
                    <input
                      type="checkbox"
                      checked={row.fullscreen}
                      onChange={(e) => updateRow(idx, { fullscreen: e.target.checked })}
                      className="h-3.5 w-3.5 accent-[var(--sd-accent)]"
                    />
                    Fullscreen
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={workspaceRows.length <= 1}
                    aria-label="Remove item"
                    className="rounded-[7px] border border-[var(--sd-line)] p-1 text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-[140ms]"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-[var(--sd-line)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)] hover:border-[var(--sd-accent)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
              >
                <Plus size={12} />
                Add item
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-[1.5] text-[var(--sd-ink-dull)]">
              Each item opens when this routine runs. Apps use the /Applications
              name (Arc, WhatsApp, Warp, Spark). Fullscreen is best-effort.
            </p>
          </div>
        ) : (
          <div>
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
              Tell JARVIS what to do with this
            </label>
            <textarea
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              placeholder={selected.directivePlaceholder}
              rows={3}
              maxLength={2000}
              autoFocus
              style={FIELD_STYLE}
              className="mt-2 w-full resize-y rounded-[9px] border border-[var(--sd-line)] px-3 py-2 text-[14px] leading-[1.5] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] transition-colors duration-[140ms]"
            />
            <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--sd-ink-dull)]">
              Plain English. This is what makes the block yours — be specific about
              what to include, filter, and hand back.
            </p>
          </div>
        )}

        <div>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
            <input
              type="checkbox"
              checked={chatterEnabled}
              onChange={(e) => setChatterEnabled(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--sd-accent)]"
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
                style={FIELD_STYLE}
                className="mt-2 w-full resize-y rounded-[9px] border border-[var(--sd-line)] px-3 py-2 text-[14px] leading-[1.5] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] transition-colors duration-[140ms]"
              />
              <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--sd-ink-dull)]">
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
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isWorkspace && cleanedWorkspaceItems.length === 0}
            className="sd-btn-solid inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-100"
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
    <div
      style={PLATE_STYLE}
      className="space-y-3 rounded-[12px] border border-[var(--sd-line)] p-5"
    >
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
          Pick a capability
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
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
              className="group flex flex-col items-start gap-1.5 rounded-[10px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-3 text-left transition-colors duration-[140ms] hover:bg-[var(--sd-hover)]"
            >
              <Icon className="h-4 w-4 text-[var(--sd-ink-dull)] transition-colors duration-[140ms] group-hover:text-[var(--sd-accent)]" />
              <span className="text-[14px] font-medium text-[var(--sd-ink)]">
                {entry.label}
              </span>
              <span className="text-[12px] leading-[1.4] text-[var(--sd-ink-dull)]">
                {entry.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
