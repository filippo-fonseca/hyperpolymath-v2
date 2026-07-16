"use client";

/**
 * StartupEditor — mirror the desktop startup config in the web register.
 *
 *   - briefingEnabled: a toggle for the spoken briefing on first invoke.
 *   - openOnStart: a list of {type: url|app, value} rows the desktop opens on
 *     launch (type select + value input, add/remove).
 *   - startupShortcuts: a list of freeform shortcut strings (add/remove).
 *
 * Save calls updateStartupConfig; the fetched config seeds the form. The Save
 * button reflects pending + dirty state. sd form grammar: WidgetCard-v2 section
 * plates, mono uppercase headers, --sd-input fields, single cyan accent.
 */

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import type { StartupConfig, StartupOpenTarget } from "@hyperpolymath/jarvis-core";
import {
  type UpdateStartupInput,
  updateStartupConfig,
} from "@/app/actions/jarvis-config";
import { cn } from "@/lib/utils";

interface Props {
  initial: StartupConfig;
}

function sameConfig(a: StartupConfig, b: StartupConfig): boolean {
  if (a.briefingEnabled !== b.briefingEnabled) return false;
  if (a.openOnStart.length !== b.openOnStart.length) return false;
  if (a.startupShortcuts.length !== b.startupShortcuts.length) return false;
  for (let i = 0; i < a.openOnStart.length; i++) {
    if (
      a.openOnStart[i]!.type !== b.openOnStart[i]!.type ||
      a.openOnStart[i]!.value !== b.openOnStart[i]!.value
    )
      return false;
  }
  for (let i = 0; i < a.startupShortcuts.length; i++) {
    if (a.startupShortcuts[i] !== b.startupShortcuts[i]) return false;
  }
  return true;
}

export function StartupEditor({ initial }: Props) {
  const [config, setConfig] = useState<StartupConfig>(initial);
  const [saved, setSaved] = useState<StartupConfig>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = !sameConfig(config, saved);

  async function handleSave() {
    setPending(true);
    setError(null);
    setJustSaved(false);
    // Drop blank rows so we never send empty strings the schema would reject.
    const cleanOpen = config.openOnStart.filter((o) => o.value.trim().length > 0);
    const cleanShortcuts = config.startupShortcuts.filter((s) => s.trim().length > 0);
    const input: UpdateStartupInput = {
      briefingEnabled: config.briefingEnabled,
      openOnStart: cleanOpen.map((o) => ({ type: o.type, value: o.value.trim() })),
      startupShortcuts: cleanShortcuts.map((s) => s.trim()),
    };
    const res = await updateStartupConfig(input);
    setPending(false);
    if (res.success) {
      setConfig(res.data);
      setSaved(res.data);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2200);
    } else {
      setError(res.error);
    }
  }

  // --- openOnStart row helpers ---------------------------------------------
  function addOpen() {
    setConfig((c) => ({
      ...c,
      openOnStart: [...c.openOnStart, { type: "url", value: "" }],
    }));
  }
  function updateOpen(i: number, patch: Partial<StartupOpenTarget>) {
    setConfig((c) => ({
      ...c,
      openOnStart: c.openOnStart.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    }));
  }
  function removeOpen(i: number) {
    setConfig((c) => ({
      ...c,
      openOnStart: c.openOnStart.filter((_, idx) => idx !== i),
    }));
  }

  // --- startupShortcuts row helpers ----------------------------------------
  function addShortcut() {
    setConfig((c) => ({ ...c, startupShortcuts: [...c.startupShortcuts, ""] }));
  }
  function updateShortcut(i: number, value: string) {
    setConfig((c) => ({
      ...c,
      startupShortcuts: c.startupShortcuts.map((s, idx) => (idx === i ? value : s)),
    }));
  }
  function removeShortcut(i: number) {
    setConfig((c) => ({
      ...c,
      startupShortcuts: c.startupShortcuts.filter((_, idx) => idx !== i),
    }));
  }

  return (
    <div className="space-y-5">
      {/* Spoken briefing toggle */}
      <SectionCard>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <SectionLabel>Spoken briefing</SectionLabel>
            <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--sd-ink-dull)]">
              When enabled, JARVIS delivers a short spoken briefing the first
              time you wake it each session.
            </p>
          </div>
          <Toggle
            checked={config.briefingEnabled}
            onChange={(v) => setConfig((c) => ({ ...c, briefingEnabled: v }))}
            label="Spoken briefing on first invoke"
          />
        </div>
      </SectionCard>

      {/* Open on start */}
      <SectionCard>
        <SectionLabel>Open on start</SectionLabel>
        <p className="mt-1 mb-4 text-[13.5px] leading-[1.5] text-[var(--sd-ink-dull)]">
          URLs and apps JARVIS opens the moment it launches. Add as many as you
          like.
        </p>

        <div className="space-y-2.5">
          {config.openOnStart.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.type}
                onChange={(e) =>
                  updateOpen(i, { type: e.target.value as StartupOpenTarget["type"] })
                }
                aria-label={`Target type for row ${i + 1}`}
                style={{ background: "var(--sd-input)" }}
                className={cn(
                  "h-9 shrink-0 rounded-[9px] border border-[var(--sd-line)] px-2.5",
                  "font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink)]",
                  "focus:outline-none focus:border-[var(--sd-accent)]",
                  "transition-colors duration-[140ms] ease-out cursor-pointer-always",
                )}
              >
                <option value="url">URL</option>
                <option value="app">App</option>
              </select>
              <input
                type="text"
                value={row.value}
                onChange={(e) => updateOpen(i, { value: e.target.value })}
                maxLength={2000}
                placeholder={row.type === "url" ? "https://example.com" : "Safari"}
                aria-label={`Value for row ${i + 1}`}
                style={{ background: "var(--sd-input)" }}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-[9px] border border-[var(--sd-line)] px-3",
                  "text-[14px] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)]",
                  "focus:outline-none focus:border-[var(--sd-accent)]",
                  "transition-colors duration-[140ms] ease-out",
                )}
              />
              <RemoveButton
                onClick={() => removeOpen(i)}
                label={`Remove open-on-start row ${i + 1}`}
              />
            </div>
          ))}
          {config.openOnStart.length === 0 && (
            <p className="text-[13px] italic text-[var(--sd-ink-faint)]">
              Nothing opens on start yet.
            </p>
          )}
        </div>

        <AddButton onClick={addOpen} label="Add target" />
      </SectionCard>

      {/* Startup shortcuts */}
      <SectionCard>
        <SectionLabel>Startup shortcuts</SectionLabel>
        <p className="mt-1 mb-4 text-[13.5px] leading-[1.5] text-[var(--sd-ink-dull)]">
          Freeform shortcut phrases JARVIS primes at launch. One per row.
        </p>

        <div className="space-y-2.5">
          {config.startupShortcuts.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={row}
                onChange={(e) => updateShortcut(i, e.target.value)}
                maxLength={200}
                placeholder="e.g. start my morning routine"
                aria-label={`Shortcut ${i + 1}`}
                style={{ background: "var(--sd-input)" }}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-[9px] border border-[var(--sd-line)] px-3",
                  "text-[14px] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)]",
                  "focus:outline-none focus:border-[var(--sd-accent)]",
                  "transition-colors duration-[140ms] ease-out",
                )}
              />
              <RemoveButton
                onClick={() => removeShortcut(i)}
                label={`Remove shortcut ${i + 1}`}
              />
            </div>
          ))}
          {config.startupShortcuts.length === 0 && (
            <p className="text-[13px] italic text-[var(--sd-ink-faint)]">
              No startup shortcuts yet.
            </p>
          )}
        </div>

        <AddButton onClick={addShortcut} label="Add shortcut" />
      </SectionCard>

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className={cn(
            "sd-btn-solid inline-flex items-center gap-2 rounded-[8px] px-4 py-2",
            "font-mono text-[12px] uppercase tracking-[0.06em]",
            "transition-opacity duration-100 cursor-pointer-always",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving
            </>
          ) : (
            "Save startup"
          )}
        </button>
        {justSaved && !dirty && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-accent)]">
            <Check size={13} /> Saved
          </span>
        )}
        {error && (
          <span className="font-mono text-[11px] text-[var(--ink-coral)]">{error}</span>
        )}
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]">
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
      {children}
    </p>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "sd-btn-outline mt-3 inline-flex items-center gap-1.5 rounded-[8px] px-3 h-8",
        "font-mono text-[11px] uppercase tracking-[0.06em]",
        "transition-colors duration-[140ms] cursor-pointer-always",
      )}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-[var(--sd-line)]",
        "text-[var(--sd-ink-dull)] hover:text-[var(--ink-coral)] hover:border-[color-mix(in_oklch,var(--ink-coral)_40%,transparent)]",
        "transition-colors duration-[140ms] ease-out cursor-pointer-always",
      )}
    >
      <X size={14} />
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{ background: checked ? "var(--sd-accent)" : "var(--sd-input)" }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[var(--sd-line)]",
        "transition-colors duration-[140ms] ease-out cursor-pointer-always",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm",
          "transition-transform duration-[140ms] ease-out",
          checked ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
