// JARVIS-05: priority token parser.
// Word-boundary matched, case-insensitive. Default P3 when no token present.

import type { Priority } from "../types";

const TOKEN_RE = /\b(ptop|p0|p1|p2|p3)\b/i;

export function parsePriority(text: string): Priority {
  const m = text.match(TOKEN_RE);
  if (!m) return "P3";
  const t = m[1]!.toLowerCase();
  if (t === "ptop" || t === "p0") return "P∞";
  if (t === "p1") return "P1";
  if (t === "p2") return "P2";
  return "P3";
}
