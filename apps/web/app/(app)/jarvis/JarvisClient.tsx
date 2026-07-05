"use client";

/**
 * JarvisClient — the two-section management island: Personality + Startup.
 *
 * A lightweight in-house segmented switcher (matching the app's journal-token
 * register, not the shadcn tabs shell) toggles between the two editors. Both
 * editors are seeded with the SSR-prefetched config and own their save flow.
 */

import { useState } from "react";
import { Bot, Rocket } from "lucide-react";
import type { PersonalityConfig, StartupConfig } from "@hyperpolymath/jarvis-core";
import { cn } from "@/lib/utils";
import { PersonalityEditor } from "./PersonalityEditor";
import { StartupEditor } from "./StartupEditor";

interface Props {
  initialPersonality: PersonalityConfig;
  initialStartup: StartupConfig;
}

type Section = "personality" | "startup";

const SECTIONS: { key: Section; label: string; icon: typeof Bot }[] = [
  { key: "personality", label: "Personality", icon: Bot },
  { key: "startup", label: "Startup & Briefing", icon: Rocket },
];

export function JarvisClient({ initialPersonality, initialStartup }: Props) {
  const [section, setSection] = useState<Section>("personality");

  return (
    <div className="space-y-6">
      {/* Section switcher — glassy segmented control in the journal register. */}
      <div
        role="tablist"
        aria-label="JARVIS management sections"
        className="inline-flex items-center gap-1 rounded-xl glass-button p-1"
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(s.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 h-8",
                "font-mono text-[11px] uppercase tracking-[0.08em]",
                "transition-colors duration-150 ease-out cursor-pointer-always",
                active
                  ? "bg-[var(--surface-raised)] text-[var(--hud-cyan)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_20%,transparent)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              )}
            >
              <Icon size={13} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
              {s.label}
            </button>
          );
        })}
      </div>

      {section === "personality" ? (
        <PersonalityEditor initial={initialPersonality} />
      ) : (
        <StartupEditor initial={initialStartup} />
      )}
    </div>
  );
}
