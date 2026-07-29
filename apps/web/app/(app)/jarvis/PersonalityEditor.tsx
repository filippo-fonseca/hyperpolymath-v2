"use client";

/**
 * PersonalityEditor — tune JARVIS's spoken voice (Spacedrive register).
 *
 * A preset selector (Canon / Minimal / Storyteller), three dials as segmented
 * radio groups (formality, verbosity, wit), and a freeform custom-instructions
 * textarea. Save calls updatePersonalityConfig; the fetched config seeds the
 * form, and the Save button reflects pending + dirty state.
 *
 * sd form grammar: WidgetCard-v2 section plates, 11px uppercase mono headers,
 * --sd-input fields, cyan-tint active segments. Single cyan accent, no glow.
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
    <div className="space-y-5">
      {/* Preset */}
      <SectionCard>
        <SectionLabel>Preset</SectionLabel>
        <p className="mt-1 mb-4 text-[13.5px] leading-[1.5] text-[var(--sd-ink-dull)]">
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
                style={
                  active
                    ? {
                        borderColor: "color-mix(in oklch, var(--sd-accent) 45%, transparent)",
                        background: "color-mix(in oklch, var(--sd-accent) 8%, var(--sd-box))",
                      }
                    : undefined
                }
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-[10px] border p-4 text-left",
                  "transition-colors duration-[140ms] ease-out cursor-pointer-always",
                  !active && "border-[var(--sd-line)] hover:bg-[var(--sd-hover)]",
                )}
              >
                <span
                  className={cn(
                    "text-[15px] font-semibold",
                    active ? "text-[var(--sd-accent)]" : "text-[var(--sd-ink)]",
                  )}
                >
                  {p.label}
                </span>
                <span className="text-[12.5px] leading-[1.45] text-[var(--sd-ink-dull)]">
                  {p.blurb}
                </span>
              </button>
            );
          })}
        </div>
        {activePreset && (
          <p className="mt-4 font-mono text-[11px] leading-[1.5] text-[var(--sd-ink-dull)]">
            Selected: <span className="text-[var(--sd-ink)]">{activePreset.label}</span> —{" "}
            {activePreset.blurb}
          </p>
        )}
      </SectionCard>

      {/* Dials */}
      <SectionCard className="space-y-6">
        <div>
          <SectionLabel>Voice dials</SectionLabel>
          <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--sd-ink-dull)]">
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
      </SectionCard>

      {/* Custom instructions */}
      <SectionCard>
        <SectionLabel>Custom instructions</SectionLabel>
        <p className="mt-1 mb-3 text-[13.5px] leading-[1.5] text-[var(--sd-ink-dull)]">
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
          style={{ background: "var(--sd-input)" }}
          className={cn(
            "w-full resize-y rounded-[10px] border border-[var(--sd-line)] px-3.5 py-3",
            "text-[14px] leading-[1.55] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)]",
            "focus:outline-none focus:border-[var(--sd-accent)]",
            "transition-colors duration-[140ms] ease-out",
          )}
        />
        <p className="mt-1.5 text-right font-mono text-[10px] text-[var(--sd-ink-faint)]">
          {(config.customInstructions ?? "").length} / 2000
        </p>
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
            "Save personality"
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

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 shadow-[var(--shadow-card)]",
        "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]",
        className,
      )}
    >
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
        <span className="text-[14px] font-medium text-[var(--sd-ink)]">{label}</span>
        <span className="text-[12.5px] text-[var(--sd-ink-dull)]">{hint}</span>
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        style={{ background: "var(--sd-input)" }}
        className="inline-flex w-full items-center gap-1 rounded-[10px] border border-[var(--sd-line)] p-1"
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
              style={
                active
                  ? {
                      background: "color-mix(in oklch, var(--sd-accent) 14%, transparent)",
                      boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 30%, transparent)",
                    }
                  : undefined
              }
              className={cn(
                "flex-1 rounded-[7px] px-3 h-8",
                "font-mono text-[11px] uppercase tracking-[0.06em]",
                "transition-colors duration-[140ms] ease-out cursor-pointer-always",
                active
                  ? "text-[var(--sd-accent)]"
                  : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
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
