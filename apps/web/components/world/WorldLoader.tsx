"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { HabitWithAreas } from "@/app/actions/habits";
import type { JournalEntry } from "@/app/actions/journal";
import type { CalendarSeed, HabitCompletionRow } from "./data/useWorldData";
import { WorldSkeleton } from "./WorldSkeleton";

/**
 * WorldLoader — the client boundary that owns the ssr:false Canvas island
 * (U-02).
 *
 * Next 16 App Router requires `dynamic(..., { ssr:false })` to live inside a
 * Client Component. Keeping it here means three/R3F are code-split into a chunk
 * that loads ONLY on /world; every 2D route ships zero 3D bytes.
 *
 * Before mounting the Canvas we run a capability gate: if WebGL2 is
 * unavailable, we render a Parchment-on-Nightwalnut fallback card instead of
 * crashing (U-19 extends this with reduced-motion handling later).
 */

const WorldCanvas = dynamic(() => import("./WorldCanvas"), {
  ssr: false,
  loading: () => <WorldSkeleton />,
});

export interface WorldLoaderProps {
  userId: string;
  initialTree: SidebarArea[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureWithLinks[];
  initialCalendar: CalendarSeed;
  initialHabits: HabitWithAreas[];
  initialHabitCompletions: HabitCompletionRow[];
  initialJournal: JournalEntry | null;
}

/** Probe for a usable WebGL2 context without leaking the throwaway canvas. */
function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

function FallbackCard(): React.ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#120E0B",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          color: "#F2E9D8",
          fontFamily: "var(--font-eb-garamond, Georgia, serif)",
          border: "1px solid rgba(201,162,39,0.35)",
          borderRadius: 16,
          padding: "32px 28px",
          backgroundColor: "rgba(14,20,32,0.55)",
          boxShadow: "0 0 48px rgba(0,0,0,0.5)",
        }}
      >
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.5,
            fontStyle: "italic",
            margin: 0,
          }}
        >
          The Studiolo needs a stronger lantern — press{" "}
          <kbd
            style={{
              fontFamily: "var(--font-jetbrains-mono, monospace)",
              fontStyle: "normal",
              fontSize: 14,
              color: "#E8C46B",
            }}
          >
            Cmd+\
          </kbd>{" "}
          to return to the Page.
        </p>
      </div>
    </div>
  );
}

export function WorldLoader(props: WorldLoaderProps): React.ReactElement {
  // The WebGL2 probe is client-only (`getContext` needs a real canvas). Running
  // it during render would make SSR — where it always returns false — emit the
  // <FallbackCard> while the client emits <WorldCanvas>, a hydration mismatch
  // (the "<WorldLoader> … <Suspense fallback> vs <div style=…>" error + flash).
  //
  // Instead, SSR and the first client render BOTH emit <WorldSkeleton> — which is
  // exactly what the dynamic() `loading` fallback shows too, so the transition to
  // the Canvas is seamless. The probe runs after mount, then we swap to the real
  // Canvas (WebGL2 present) or the branded FallbackCard (absent) as a normal
  // client update, never a hydration comparison.
  const [decision, setDecision] = useState<"pending" | "canvas" | "fallback">(
    "pending",
  );

  useEffect(() => {
    setDecision(hasWebGL2() ? "canvas" : "fallback");
  }, []);

  if (decision === "pending") return <WorldSkeleton />;
  if (decision === "fallback") return <FallbackCard />;

  return <WorldCanvas {...props} />;
}

export default WorldLoader;
