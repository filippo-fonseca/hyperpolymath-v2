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
        transition={{ duration: 0.12 }}
        className="absolute bottom-full left-0 mb-2 min-w-[16rem] rounded-md border bg-popover p-1 font-mono text-sm shadow-md z-50"
        role="listbox"
        aria-label="Slash commands"
      >
        {filtered.map((cmd, idx) => {
          const isHighlighted =
            idx ===
            Math.min(Math.max(0, selectedIndex), filtered.length - 1);
          return (
            // Phase 6 Plan 06-05 (UI-SPEC §10 / D-09): native <button> — covered
            // by the universal `button { cursor: pointer; }` rule in globals.css.
            // No explicit cursor-pointer className required.
            <button
              key={cmd.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(cmd.key);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left",
                isHighlighted
                  ? "bg-secondary text-foreground"
                  : "hover:bg-secondary/60",
              )}
              role="option"
              aria-selected={isHighlighted}
            >
              <span>{cmd.label}</span>
              <span className="text-xs text-muted-foreground">
                {cmd.description}
              </span>
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
