"use client";

import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";

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
 * Phase 6.1 Plan 02 (UI-SPEC §9c diplomatic-surface treatment):
 *   - --surface-raised bg + 1px --edge border
 *   - 10px corner L-brackets (static, smaller than the 12px console crops)
 *   - 'commands' header in mono 11px uppercase tracking-[0.08em]
 *   - Option rows in mono 12px --ink-muted with hover state surfacing --ink
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
        className="absolute bottom-full left-0 mb-2 min-w-[18rem] rounded-md font-mono z-50"
        style={{
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--edge)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.3)",
        }}
        role="listbox"
        aria-label="Slash commands"
      >
        {/* Phase 6.1 Plan 02 (UI-SPEC §9c): 10px corner L-brackets, static
            (no breathing on diplomatic surfaces — the popover is transient). */}
        <HudCornerCrops
          size={10}
          className="absolute inset-0 pointer-events-none"
          breathing={false}
        />

        {/* Phase 6.1 Plan 02 (UI-SPEC §12c): 'commands' header in mono 11px
            uppercase tracking-wide --ink-muted */}
        <div
          className="relative px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]"
          style={{ borderBottom: "1px solid var(--edge)" }}
        >
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
                  "flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left font-mono text-xs transition-colors duration-100 ease-out",
                  isHighlighted
                    ? "text-[var(--ink)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
                style={
                  isHighlighted
                    ? { backgroundColor: "var(--surface)" }
                    : undefined
                }
                role="option"
                aria-selected={isHighlighted}
              >
                <span>{cmd.label}</span>
                <span className="text-[11px] text-[var(--ink-muted)]">
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
