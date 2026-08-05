"use client";

/**
 * TriggerBuilder — edits a routine's triggers[] (a discriminated union over
 * `type`: wake | utterance | time | hotkey). OR semantics: any trigger fires
 * the routine. Adding opens a 4-way type selector, then swaps to the
 * type-specific input. Hotkeys use a live keydown-capture button.
 */

import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import type { RoutineTrigger, RoutineTriggerType } from "@hyperpolymath/jarvis-core";
import { TRIGGER_TYPES, triggerMeta } from "./trigger-labels";

interface Props {
  triggers: RoutineTrigger[];
  onChange: (triggers: RoutineTrigger[]) => void;
}

const fieldClass =
 "w-full rounded-[9px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-3 py-2 text-meta text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] outline-none focus:border-[var(--sd-accent)] transition-colors duration-[140ms]";

function emptyTrigger(type: RoutineTriggerType): RoutineTrigger {
  switch (type) {
    case "wake":
      return { type: "wake", phrase: "" };
    case "utterance":
      return { type: "utterance", match: "" };
    case "time":
      return { type: "time", at: "07:00" };
    case "hotkey":
      return { type: "hotkey", accelerator: "" };
  }
}

export function TriggerBuilder({ triggers, onChange }: Props) {
  const [adding, setAdding] = useState(false);

  const updateAt = useCallback(
    (index: number, next: RoutineTrigger) => {
      onChange(triggers.map((t, i) => (i === index ? next : t)));
    },
    [triggers, onChange],
  );

  const remove = useCallback(
    (index: number) => onChange(triggers.filter((_, i) => i !== index)),
    [triggers, onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
 <p className="text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
          Triggers
        </p>
        {triggers.length > 1 ? (
 <p className="text-micro text-[var(--sd-ink-dull)]">
            Any of these fires the routine.
          </p>
        ) : null}
      </div>

      {triggers.length === 0 && !adding ? (
 <p className="text-meta text-[var(--sd-ink-dull)]">
          No triggers yet. Add at least one so JARVIS knows when to run this.
        </p>
      ) : null}

      <div className="space-y-2">
        {triggers.map((trigger, i) => {
          const meta = triggerMeta(trigger.type);
          const Icon = meta.icon;
          return (
            <div
              key={i}
              style={{ background: "var(--sd-darker-box)" }}
              className="flex items-start gap-3 rounded-[10px] border border-[var(--sd-line)] p-3"
            >
              <span
                style={{ background: "var(--sd-input)" }}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--sd-line)] text-[var(--sd-accent)]"
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
 <p className="text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
                  {meta.label}
                </p>
                <div className="mt-1.5">
                  <TriggerInput
                    trigger={trigger}
                    onChange={(next) => updateAt(i, next)}
                  />
                </div>
 <p className="mt-1.5 text-micro text-[var(--sd-ink-dull)]">
                  {meta.hint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded-[8px] border border-[var(--sd-line)] p-1.5 text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
                aria-label="Remove trigger"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div
          style={{ background: "var(--sd-darker-box)" }}
          className="rounded-[10px] border border-[var(--sd-line)] p-3"
        >
 <p className="mb-2 text-micro tracking-[0.1em] text-[var(--sd-ink-faint)]">
            Pick a trigger type
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TRIGGER_TYPES.map((meta) => {
              const Icon = meta.icon;
              return (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => {
                    onChange([...triggers, emptyTrigger(meta.type)]);
                    setAdding(false);
                  }}
                  className="group flex flex-col items-center gap-1.5 rounded-[9px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-3 text-center transition-colors duration-[140ms] hover:bg-[var(--sd-hover)]"
                >
                  <Icon className="h-4 w-4 text-[var(--sd-ink-dull)] transition-colors duration-[140ms] group-hover:text-[var(--sd-accent)]" />
 <span className="text-micro text-[var(--sd-ink)]">
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setAdding(false)}
 className="mt-2 text-micro text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
 className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-[var(--sd-line)] px-3 py-2 text-micro text-[var(--sd-ink-dull)] hover:border-[var(--sd-accent)] hover:text-[var(--sd-ink)] transition-colors duration-[140ms]"
        >
          <Plus size={14} /> Add trigger
        </button>
      )}
    </div>
  );
}

// --- per-type inputs -------------------------------------------------------

function TriggerInput({
  trigger,
  onChange,
}: {
  trigger: RoutineTrigger;
  onChange: (t: RoutineTrigger) => void;
}) {
  switch (trigger.type) {
    case "wake":
      return (
        <input
          type="text"
          value={trigger.phrase}
          onChange={(e) => onChange({ type: "wake", phrase: e.target.value })}
          placeholder="Daddy's Home"
          maxLength={120}
          className={fieldClass}
        />
      );
    case "utterance":
      return (
        <input
          type="text"
          value={trigger.match}
          onChange={(e) => onChange({ type: "utterance", match: e.target.value })}
          placeholder="start my day"
          maxLength={200}
          className={fieldClass}
        />
      );
    case "time":
      return (
        <input
          type="time"
          value={trigger.at}
          onChange={(e) => onChange({ type: "time", at: e.target.value })}
          className={`${fieldClass} max-w-[160px] [color-scheme:light] dark:[color-scheme:dark]`}
        />
      );
    case "hotkey":
      return (
        <HotkeyCapture
          value={trigger.accelerator}
          onChange={(accelerator) => onChange({ type: "hotkey", accelerator })}
        />
      );
  }
}

const MODIFIERS = ["Control", "Alt", "Shift", "Meta"];

function HotkeyCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (accelerator: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!capturing) return;
    e.preventDefault();
    if (e.key === "Escape") {
      onChange("");
      setCapturing(false);
      return;
    }
    // Ignore pure-modifier keydowns until a real key arrives.
    if (MODIFIERS.includes(e.key)) return;

    const parts = [
      e.metaKey && "Cmd",
      e.ctrlKey && "Ctrl",
      e.shiftKey && "Shift",
      e.altKey && "Alt",
      e.key.length === 1 ? e.key.toUpperCase() : e.key,
    ].filter(Boolean) as string[];

    // Require at least one modifier + one key.
    if (parts.length < 2) return;
    onChange(parts.join("+"));
    setCapturing(false);
  }

  return (
    <button
      type="button"
      onClick={() => setCapturing(true)}
      onKeyDown={onKeyDown}
      onBlur={() => setCapturing(false)}
      style={{ background: "var(--sd-input)" }}
      className={`inline-flex min-w-[140px] items-center justify-center rounded-[9px] border px-3 py-2 font-mono text-meta tracking-[0.08em] text-[var(--sd-ink)] outline-none transition-colors duration-[140ms] ${
        capturing ? "border-[var(--sd-accent)]" : "border-[var(--sd-line)]"
      }`}
    >
      {capturing
        ? "Press keys…"
        : value
          ? prettyAcceleratorInline(value)
          : "Set hotkey"}
    </button>
  );
}

function prettyAcceleratorInline(accelerator: string): string {
  const map: Record<string, string> = {
    Cmd: "⌘",
    Ctrl: "⌃",
    Shift: "⇧",
    Alt: "⌥",
  };
  return accelerator
    .split("+")
    .map((p) => map[p] ?? p)
    .join(" ");
}
