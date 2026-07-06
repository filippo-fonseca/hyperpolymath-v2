"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
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
  // Probe once on mount; the result is stable for the session.
  const webgl2 = useMemo(hasWebGL2, []);

  if (!webgl2) return <FallbackCard />;

  return <WorldCanvas {...props} />;
}

export default WorldLoader;
