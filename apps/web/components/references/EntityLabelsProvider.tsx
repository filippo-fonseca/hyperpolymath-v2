"use client";

import { useMemo } from "react";
import {
  EntityLabelsContext,
  useEntityLabels,
} from "./use-entity-labels";
import type { EntityLabelRequest } from "@/lib/references/resolve-labels";
import { parseReferences } from "@/lib/references/token";

/**
 * Resolves every reference token in a subtree, once, and hands the answers to
 * the pills below it (S7).
 *
 * Wrap the component that owns the *text* — a capture card, a task row, a
 * JARVIS bubble — not the individual pills. Pass the raw strings and it finds
 * the tokens itself, which keeps callers from having to know the grammar.
 *
 * Rendering pills without this provider is supported and safe: they fall back
 * to the snapshot label carried in the token. The provider is what upgrades
 * them to live labels, tombstones, and hover previews.
 */
export function EntityLabelsProvider({
  text,
  refs,
  children,
}: {
  /** Raw source text (or several) to scan for tokens. */
  text?: string | null | readonly (string | null | undefined)[];
  /** Refs already parsed by the caller, merged with anything found in `text`. */
  refs?: readonly EntityLabelRequest[];
  children: React.ReactNode;
}) {
  // Normalize to a stable primitive before parsing: `text` is often a fresh
  // array literal, and hanging the memo off the array identity would re-parse
  // (and re-key the query) on every single render.
  const joined = useMemo(() => {
    if (text == null) return "";
    return (Array.isArray(text) ? text : [text])
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .join("\n");
  }, [text]);

  const refsKey = useMemo(
    () => (refs ?? []).map((r) => `${r.type}:${r.id}`).join(","),
    [refs],
  );

  const collected = useMemo(() => {
    const fromText: EntityLabelRequest[] = parseReferences(joined).map((r) => ({
      type: r.type,
      id: r.id,
    }));
    // `normalizeLabelRequests` inside the hook dedupes and caps, so a ref that
    // arrives both ways costs nothing here.
    return refs ? [...fromText, ...refs] : fromText;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by refsKey, not the array identity
  }, [joined, refsKey]);

  const map = useEntityLabels(collected);

  return (
    <EntityLabelsContext.Provider value={map}>
      {children}
    </EntityLabelsContext.Provider>
  );
}
