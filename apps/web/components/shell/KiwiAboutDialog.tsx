"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

/**
 * "Who is Kiwi?" info modal — accessible from the sidebar.
 *
 * Visual register matches the README hero / public landing: large serif
 * wordmark with the kiwi glyph perched at its left shoulder, cream/canvas
 * background, journal-paper tagline beneath, then a short body explaining
 * what Kiwi (a.k.a. JARVIS) actually does.
 */

interface KiwiAboutDialogProps {
  /** The trigger element. Omit when driving the dialog with `open`. */
  children?: ReactNode;
  /** Controlled mode — the sidebar opens this from its overflow menu, where
   *  there is no trigger element to wrap (a menu item unmounts on select). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function KiwiAboutDialog({ children, open, onOpenChange }: KiwiAboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-[var(--edge)]">
        {/* Hero band — mirrors the readmehero flyer: kiwi glyph + serif
            wordmark on a cream surface, with a single italic tagline under
            it. Generous padding so the type can breathe. */}
        <div
          className="px-8 pt-10 pb-7 border-b border-[var(--edge)]"
          style={{ backgroundColor: "var(--canvas)" }}
        >
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-center gap-3 text-[var(--ink)]">
              <KiwiIcon
                size={40}
                aria-hidden="true"
                className="shrink-0"
              />
              <DialogTitle className="text-[36px] leading-none font-semibold tracking-[-0.01em] m-0">
                Hyperpolymath
              </DialogTitle>
            </div>
            <DialogDescription className="text-center text-[14px] italic text-[var(--ink-muted)]">
              A personal life-OS for people who refuse to specialize.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body — short, document-y prose. */}
        <div
          className="px-8 py-6 space-y-3 text-[14px] leading-[1.65] text-[var(--ink)]"
          style={{ backgroundColor: "var(--surface)" }}
        >
          <p>
            Hi, I&rsquo;m <span className="font-semibold">Kiwi</span> —
            internally also called <span className="font-semibold">JARVIS</span>
            . Same bird, fancier name. I&rsquo;m the natural-language agent
            at the core of Hyperpolymath, and my one job is to be your{" "}
            <span className="italic">orchestrator</span>: you type or speak
            a sentence, I figure out which of your primitives it belongs to,
            and I route it to the right place.
          </p>
          <p>
            Areas, projects, captures, your calendar, your tasks, your
            habits, your training. I know where they all live. I never make
            up tools that don&rsquo;t exist — the schema is my contract,
            and Claude Sonnet 4.6 with Strict Tool Use enforces it at
            generation time, so I can&rsquo;t drift even if I tried.
          </p>
          <p className="text-[var(--ink-muted)] italic pt-1">
            Find me on the JARVIS tab. Try typing &ldquo;coffee with brian
            4pm saturday, send the brief friday afternoon.&rdquo;
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
