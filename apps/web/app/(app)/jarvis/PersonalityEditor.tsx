"use client";

/**
 * PersonalityEditor — tune JARVIS's spoken voice.
 *
 * A preset selector (Canon / Minimal / Storyteller), three dials as segmented
 * radio groups (formality, verbosity, wit), and a freeform custom-instructions
 * textarea. Save calls updatePersonalityConfig; the fetched config seeds the
 * form, and the Save button reflects pending + dirty state.
 *
 * The visual vocabulary matches the routines settings page: .glass-tile cards,
 * mono uppercase section labels, EB Garamond body, cyan accent on the active
 * segment. No new design language is invented here.
 */

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type {
  PersonalityConfig,
  PersonalityFormality,
  PersonalityPreset,
  PersonalityVerbosity,
  PersonalityWit,
} from "@hyperpolymath/jarvis-core";
import {
  type UpdatePersonalityInput,
  updatePersonalityConfig,
} from "@/app/actions/jarvis-config";
import { cn } from "@/lib/utils";

const PRESETS: { value: PersonalityPreset; label: string; blurb: string }[] = [
  {
    value: "canon",
    label: "Canon",
    blurb: "The default JARVIS voice — dry, precise, unflappably composed.",
  },
  {
    value: "minimal",
    label: "Minimal",
    blurb: "Stripped back. Answers first, no flourish, minimum words.",
  },
  {
    value: "storyteller",
    label: "Storyteller",
    blurb: "Warmer and more expansive; frames things with a little narrative.",
  },
];

const FORMALITY: { value: PersonalityFormality; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "balanced", label: "Balanced" },
  { value: "casual", label: "Casual" },
];

const VERBOSITY: { value: PersonalityVerbosity; label: string }[] = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "expansive", label: "Expansive" },
];

const WIT: { value: PersonalityWit; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "moderate", label: "Moderate" },
  { value: "playful", label: "Playful" },
];

interface Props {
  initial: PersonalityConfig;
}

export function PersonalityEditor({ initial }: Props) {
  const [config, setConfig] = useState<PersonalityConfig>(initial);
  const [saved, setSaved] = useState<PersonalityConfig>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    config.preset !== saved.preset ||
    config.formality !== saved.formality ||
    config.verbosity !== saved.verbosity ||
    config.wit !== saved.wit ||
    (config.customInstructions ?? "") !== (saved.customInstructions ?? "");

  async function handleSave() {
    setPending(true);
    setError(null);
    setJustSaved(false);
    const input: UpdatePersonalityInput = {
      preset: config.preset,
      formality: config.formality,
      verbosity: config.verbosity,
      wit: config.wit,
      customInstructions: config.customInstructions ?? null,
    };
    const res = await updatePersonalityConfig(input);
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

  const activePreset = PRESETS.find((p) => p.value === config.preset);

  return (
    <div className="space-y-6">
      {/* Preset */}
      <section className="glass-tile rounded-xl p-6">
        <SectionLabel>Preset</SectionLabel>
        <p className="mt-1 mb-4 font-serif text-[14px] leading-[1.5] text-[var(--ink-muted)]">
          A starting point for the voice. The dials below fine-tune it.
        </p>
        <div
          role="radiogroup"
          aria-label="Personality preset"
          className="grid gap-3 sm:grid-cols-3"
        >
          {PRESETS.map((p) => {
            const active = config.preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setConfig((c) => ({ ...c, preset: p.value }))}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left",
                  "transition-colors duration-150 ease-out cursor-pointer-always",
                  active
                    ? "border-[color-mix(in_oklch,var(--hud-cyan)_45%,transparent)] bg-[color-mix(in_oklch,var(--hud-cyan)_6%,transparent)]"
                    : "border-[var(--edge)] hover:border-[color-mix(in_oklch,var(--ink)_25%,transparent)]"
                )}
              >
                <span
                  className={cn(
                    "font-serif text-[16px] font-semibold",
                    active ? "text-[var(--hud-cyan)]" : "text-[var(--ink)]"
                  )}
                >
                  {p.label}
                </span>
                <span className="font-serif text-[13px] leading-[1.45] text-[var(--ink-muted)]">
                  {p.blurb}
                </span>
              </button>
            );
          })}
        </div>
        {activePreset && (
          <p className="mt-4 font-mono text-[11px] leading-[1.5] text-[var(--ink-muted)]">
            Selected: <span className="text-[var(--ink)]">{activePreset.label}</span> —{" "}
            {activePreset.blurb}
          </p>
        )}
      </section>

      {/* Dials */}
      <section className="glass-tile rounded-xl p-6 space-y-6">
        <div>
          <SectionLabel>Voice dials</SectionLabel>
          <p className="mt-1 font-serif text-[14px] leading-[1.5] text-[var(--ink-muted)]">
            Nudge the tone independent of the preset.
          </p>
        </div>

        <Dial
          label="Formality"
          hint="How buttoned-up the phrasing is."
          options={FORMALITY}
          value={config.formality}
          onChange={(v) => setConfig((c) => ({ ...c, formality: v }))}
        />
        <Dial
          label="Verbosity"
          hint="How much it says per answer."
          options={VERBOSITY}
          value={config.verbosity}
          onChange={(v) => setConfig((c) => ({ ...c, verbosity: v }))}
        />
        <Dial
          label="Wit"
          hint="How often it lets a little humor through."
          options={WIT}
          value={config.wit}
          onChange={(v) => setConfig((c) => ({ ...c, wit: v }))}
        />
      </section>

      {/* Custom instructions */}
      <section className="glass-tile rounded-xl p-6">
        <SectionLabel>Custom instructions</SectionLabel>
        <p className="mt-1 mb-3 font-serif text-[14px] leading-[1.5] text-[var(--ink-muted)]">
          Freeform directives layered on top of the dials. Optional — leave blank
          for none.
        </p>
        <textarea
          value={config.customInstructions ?? ""}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              customInstructions: e.target.value.length ? e.target.value : null,
            }))
          }
          maxLength={2000}
          rows={4}
          placeholder="e.g. Call me by my first name. Never open with a greeting. Prefer metric units."
          className={cn(
            "w-full resize-y rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3.5 py-3",
            "font-serif text-[15px] leading-[1.55] text-[var(--ink)] placeholder:text-[var(--ink-muted)]",
            "focus:outline-none focus:border-[color-mix(in_oklch,var(--hud-cyan)_45%,transparent)]",
            "transition-colors duration-150 ease-out"
          )}
        />
        <p className="mt-1.5 text-right font-mono text-[10px] text-[var(--ink-muted)]">
          {(config.customInstructions ?? "").length} / 2000
        </p>
      </section>

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-[var(--ink)] px-4 py-2",
            "font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)]",
            "transition-opacity duration-100 cursor-pointer-always",
            "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving
            </>
          ) : (
            "Save personality"
          )}
        </button>
        {justSaved && !dirty && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--hud-cyan)]">
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
      {children}
    </p>
  );
}

function Dial<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-serif text-[15px] font-medium text-[var(--ink)]">{label}</span>
        <span className="font-serif text-[13px] text-[var(--ink-muted)]">{hint}</span>
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex w-full items-center gap-1 rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] p-1"
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex-1 rounded-md px-3 h-8",
                "font-mono text-[11px] uppercase tracking-[0.06em]",
                "transition-colors duration-150 ease-out cursor-pointer-always",
                active
                  ? "bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)] text-[var(--hud-cyan)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_28%,transparent)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
