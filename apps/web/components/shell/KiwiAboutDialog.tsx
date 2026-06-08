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
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";

/**
 * "Who is Kiwi?" info modal — accessible from the sidebar.
 *
 * Wraps shadcn Dialog. Children act as the trigger (passed asChild),
 * so callers can drop any button-like element in. The modal body shows
 * a small HudCoreBubble (the in-app JARVIS centerpiece) at the top
 * followed by a friendly synopsis of who Kiwi is and what they do.
 */

interface KiwiAboutDialogProps {
  children: ReactNode; // the trigger element
}

export function KiwiAboutDialog({ children }: KiwiAboutDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          {/* Mini HudCoreBubble — same visual as the in-app JARVIS Console
              centerpiece and the landing hero, scaled down to fit the modal
              header. Sits inside .agent-mode-scope so any agent-only chrome
              renders correctly. */}
          <div className="agent-mode-scope mx-auto -mt-2 mb-2 flex items-center justify-center">
            <div
              style={{
                width: 140,
                height: 140,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ transform: "scale(0.5)", transformOrigin: "center" }}>
                <HudCoreBubble state="thinking" />
              </div>
            </div>
          </div>

          <DialogTitle className="text-center font-serif text-[24px] font-semibold leading-[1.2]">
            Hi, I&rsquo;m Kiwi.
          </DialogTitle>
          <DialogDescription className="text-center font-serif italic text-[14px] text-[var(--ink-muted)]">
            Friendly. All-knowing within your life-OS. Orchestrator by trade.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3 font-serif text-[14px] leading-[1.6] text-[var(--ink)]">
          <p>
            I&rsquo;m the kiwi-bird agent at the core of Hyperpolymath.
            Internally I&rsquo;m also called JARVIS (same bird, fancier
            name). My one and only job is to be your{" "}
            <span className="font-semibold">orchestrator</span>: when you
            type or speak a sentence, I figure out which of your five
            primitives it belongs to and route it to the right place.
          </p>
          <p>
            Areas, projects, captures, your calendar, your tasks. I know
            where they all live. I never make up tools that don&rsquo;t
            exist. The schema is my contract, and Claude Sonnet 4.6 with
            Strict Tool Use enforces it at generation time, so I
            can&rsquo;t drift even if I tried.
          </p>
          <p className="text-[var(--ink-muted)] italic">
            Find me on the JARVIS tab. Try typing &ldquo;coffee with brian
            4pm saturday, send the brief friday afternoon.&rdquo;
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
