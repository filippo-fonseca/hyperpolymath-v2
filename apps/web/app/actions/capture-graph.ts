"use server";

import type { CaptureGraph } from "@/lib/captures/graph-edges";
import {
  EMPTY_CAPTURE_GRAPH,
  buildCaptureGraphForUser,
} from "@/lib/db/queries/capture-graph";
import { createClient } from "@/lib/supabase/server";

/**
 * Captures link graph (S10) — the read behind /captures' graph view.
 *
 * Auth boundary only; the queries live in lib/db/queries/capture-graph.ts.
 * `userId` comes from the validated JWT claims, never from the caller.
 */
export async function getCaptureGraph(): Promise<CaptureGraph> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  // Degrade quietly rather than throwing into the canvas, matching the other
  // reference-surface actions.
  if (error || !data?.claims) return EMPTY_CAPTURE_GRAPH;

  return buildCaptureGraphForUser(data.claims.sub);
}
