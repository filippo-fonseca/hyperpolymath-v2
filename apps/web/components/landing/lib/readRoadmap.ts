/**
 * ROADMAP.md reader + parser — Phase 8 (LAND-BUILDLOG / D-09).
 *
 * Per RESEARCH §Pattern 4 + Pitfall 3:
 *   - Reads .planning/ROADMAP.md via fs.readFile
 *   - CWD differs between dev (apps/web/) and Vercel prod — uses candidate
 *     fallback path strategy
 *   - File made available in prod bundle via apps/web/next.config.ts
 *     outputFileTracingIncludes (set in Plan 08-02)
 *   - Parser: regex against "## Progress" table for "In Progress" row
 */

import fs from "node:fs/promises";
import path from "node:path";

export type CurrentPhase = {
  readonly number: string; // e.g., "7"
  readonly name: string; // e.g., "JARVIS Voice + Ambient"
  readonly plansComplete: string; // e.g., "3/4"
};

export async function readRoadmapSafely(): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), "../../.planning/ROADMAP.md"), // Vercel: cwd = apps/web/
    path.join(process.cwd(), ".planning/ROADMAP.md"), // some envs: cwd = repo root
    path.join(process.cwd(), "../.planning/ROADMAP.md"), // safety net
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p, "utf-8");
    } catch {
      continue;
    }
  }
  console.warn("[BuildLog] ROADMAP.md not found in any candidate path");
  return null;
}

/**
 * Parse the "## Progress" table for rows with Status == "In Progress".
 * Returns the FIRST in-progress row, or null if none found.
 *
 * Row format (verified from .planning/ROADMAP.md):
 *   | 7. JARVIS Voice + Ambient | 3/4 | In Progress|  |
 */
const PHASE_ROW_RE = /^\|\s*([\d.]+)\.\s+(.+?)\s*\|\s*(\d+\/\d+)\s*\|\s*In Progress/m;

export function parseCurrentPhase(roadmap: string): CurrentPhase | null {
  const match = PHASE_ROW_RE.exec(roadmap);
  if (!match) return null;
  const [, number, name, plansComplete] = match;
  return { number, name: name.trim(), plansComplete };
}
