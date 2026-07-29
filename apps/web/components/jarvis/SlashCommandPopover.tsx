"use client";

import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Slash-command popover (D-07).
 *
 * NOT a Mention extension — slash commands shape the system prompt sent to
 * Claude (forcing `tool_choice`) rather than inserting an entity. So this is
 * a plain React popover, positioned by JarvisInput, with selection state
 * also lifted to JarvisInput (keystroke handling lives there).
 *
 * `/help` is local-only — JarvisInput intercepts and renders the command
 * list without submitting.
 *
 * sd (Spacedrive) register: a solid `sd-menu-surface` popover — no corner
 * brackets, no blur. A mono 'commands' header, option rows in mono
 * --sd-ink-dull, and the highlighted row surfacing the single cyan accent.
 */

const COMMANDS = [
  { key: "task", label: "/task", description: "Force task creation" },
  { key: "capture", label: "/capture", description: "Force capture creation" },
  { key: "event", label: "/event", description: "Force calendar event" },
  { key: "ask", label: "/ask", description: "Ask JARVIS a question (no action)" },
  { key: "help", label: "/help", description: "Show command list" },
] as const;

export type SlashCommandKey = (typeof COMMANDS)[number]["key"];

export const SLASH_COMMANDS = COMMANDS;

interface Props {
  query: string; // text after the leading "/"
  selectedIndex: number;
  onSelect: (key: SlashCommandKey) => void;
}

export function SlashCommandPopover({ query, selectedIndex, onSelect }: Props) {
  const filtered = COMMANDS.filter((c) =>
    c.key.startsWith(query.toLowerCase()),
  );
  if (filtered.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 2 }}
        transition={{ duration: 0.12, ease: [0.25, 1, 0.5, 1] }}
        // No inline box-shadow: .sd-menu-surface already carries the craft
        // --shadow-pop lift (globals.css cascade upgrade), and an inline
        // declaration would clobber it in both themes.
        className="sd-menu-surface absolute bottom-full left-0 mb-2 min-w-[18rem] rounded-xl font-mono z-50"
        role="listbox"
        aria-label="Slash commands"
      >
        {/* 'commands' header — mono cyan readout marking JARVIS chrome. */}
        <div className="relative px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)] border-b border-[var(--sd-line)]">
          commands
        </div>

        <div className="relative p-1">
          {filtered.map((cmd, idx) => {
            const isHighlighted =
              idx ===
              Math.min(Math.max(0, selectedIndex), filtered.length - 1);
            return (
              // Phase 6 Plan 06-05 (UI-SPEC §10 / D-09): native <button> — covered
              // by the universal `button { cursor: pointer; }` rule in globals.css.
              <button
                key={cmd.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(cmd.key);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[6px] px-2 py-1 text-left font-mono text-xs transition-colors duration-[140ms] ease-out",
                  isHighlighted
                    ? "text-[var(--sd-accent)]"
                    : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
                )}
                style={
                  isHighlighted
                    ? { backgroundColor: "var(--sd-selected)" }
                    : undefined
                }
                role="option"
                aria-selected={isHighlighted}
              >
                <span>{cmd.label}</span>
                <span className="text-[11px] text-[var(--sd-ink-faint)]">
                  {cmd.description}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
