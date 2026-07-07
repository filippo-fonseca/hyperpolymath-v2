"use client";

/**
 * JournalWidget.tsx — W-11 · The Studiolo · The Bottega (Phase 3) · journal-widget
 *
 * Today's page, glanceable. The Page (`/journaling`) stays the desk you write
 * at; the bench only READS. A self-contained `WidgetComponentProps` component
 * that renders ITS content into the W-03 `<WorldPanel>` primitive (the shell
 * owns the skin, frame, LOD split, and world-pick/summon plumbing — this unit
 * only supplies the preview + the open-on-Page affordance, the TodayPanel
 * doctrine WorldPanel cites). NO in-world editing this phase.
 *
 * DATA (read-only, in RENDER, never per-frame): the journal-today slice the
 * provider (W-01) mounts at `["journaling", userId, todayYmd]` — read here as
 * `useWorldData().journal.entry`. The 2D editor invalidates the whole
 * `["journaling", userId]` prefix on every autosave (see `JournalingClient`'s
 * `useTableSubscription("journal_entries")`), and the provider's journal-today
 * query lives UNDER that prefix, so writing in the 2D tab re-fetches this
 * slice and the panel updates live — the acceptance's "other tab updates the
 * panel" is pure prefix-invalidation, nothing wired here.
 *
 * ── EXTRACTION DECISION (resolves §1.2's flagged honest note) ────────────────
 * §1.2 flagged the entry content as "likely rich JSON" and offered a degraded
 * "entry exists / status" fallback if a plain-text extraction proved ugly. On
 * inspection the content is NOT rich JSON: `journal_entries.main_response` and
 * `.notes_section` are plain `text` columns (schema.ts ~1297) written by two
 * bare `<textarea>`s in `JournalEntryEditor.tsx`. So the extraction is the
 * clean path (no degradation): combine the two plain-text fields, show the
 * first ~12 lines / ~600 chars as the preview, and a word-count caption. The
 * degraded fallback is intentionally NOT taken — documented per the plan.
 *
 * ── THE ONE DOORWAY (reuses ModeToggle, invents no second 2D↔3D path) ────────
 * "Open on the Page →" must NOT be a bare `router.push`. `ModeToggle.tsx` owns
 * the single 2D↔3D doorway: a global `keydown` listener on Cmd+\ that, when in
 * the world, reads `sessionStorage['world:lastPageRoute']` and glides there
 * (with its Nightwalnut fade). This affordance reuses that exact doorway — it
 * writes the journaling route into that same sessionStorage key, then dispatches
 * the Cmd+\ keydown ModeToggle already listens for. ModeToggle does the rest
 * (its router + its transition). No router import, no second doorway. Landing
 * on `/journaling?date=<todayYmd>` selects today (the page's `?date` deep-link,
 * page.tsx ~30 — absent/invalid falls back to today anyway; the explicit param
 * makes "today selected" robust against any future default change).
 *
 * PERF (§6/§7.2): the preview + word count are derived in RENDER (memoized on
 * the entry identity), never per-frame; content changes only when the journal
 * query refetches. No `useFrame`, no ref mutation, no `invalidate()`.
 */

import { type JSX, useCallback, useMemo } from "react";
import { Container, Text } from "@react-three/uikit";
import { Button } from "@react-three/uikit-default";
import type { JournalEntry } from "@/app/actions/journal";
import { useWorldData } from "../data/useWorldData";
import { STUDIOLO } from "../materials/tokens";
import { WorldPanel, type DragHandleProps } from "./WorldPanel";
import type { WidgetComponentProps } from "./widgetRegistry";

/** uikit/R3F pointer events expose `stopPropagation`; that's all we need. */
type PanelClick = (event: { stopPropagation: () => void }) => void;

/** The glance preview cap (§1.2's "first ~12 lines / ~600 chars"). */
const PREVIEW_MAX_LINES = 12;
const PREVIEW_MAX_CHARS = 600;

/** ModeToggle's sessionStorage key — the SAME constant it reads (ModeToggle.tsx ~35). */
const LAST_PAGE_KEY = "world:lastPageRoute";

/**
 * Combine the two plain-text fields into one glanceable body. `mainResponse`
 * (the answer to the fixed prompt) leads; `notesSection` follows a blank line
 * when present. Both are trimmed so a whitespace-only field never counts.
 */
function combineEntryText(entry: JournalEntry | null): string {
  if (!entry) return "";
  const main = (entry.mainResponse ?? "").trim();
  const notes = (entry.notesSection ?? "").trim();
  return [main, notes].filter((s) => s.length > 0).join("\n\n");
}

/** First ~12 lines / ~600 chars, with a truncation flag for the "…" hint. */
function extractPreview(text: string): { preview: string; truncated: boolean } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let truncated = lines.length > PREVIEW_MAX_LINES;
  let preview = lines.slice(0, PREVIEW_MAX_LINES).join("\n");
  if (preview.length > PREVIEW_MAX_CHARS) {
    preview = preview.slice(0, PREVIEW_MAX_CHARS).trimEnd();
    truncated = true;
  }
  return { preview, truncated };
}

/** Whitespace-delimited word count across the whole entry (main + notes). */
function countWords(text: string): number {
  const t = text.trim();
  if (t.length === 0) return 0;
  return t.split(/\s+/).length;
}

/**
 * The shared "Open on the Page →" affordance, present in BOTH the has-entry and
 * blank states (per §W-11). WorldPanel's `status="empty"` branch renders only
 * its `emptyLine` and discards children — so to keep the affordance visible when
 * the page is blank, this widget always renders through the "ready" content
 * region and paints its own quiet blank-line, rather than delegating to the
 * primitive's empty aside.
 */
function OpenOnPageAffordance({ onOpen }: { onOpen: PanelClick }): JSX.Element {
  return (
    <Container paddingTop={10} flexDirection="row">
      <Button
        variant="ghost"
        size="sm"
        height={22}
        paddingX={10}
        borderRadius={6}
        borderWidth={1}
        borderColor={STUDIOLO.brass}
        onClick={onOpen}
      >
        {/* The arrow is U+2192 (General Punctuation-adjacent, present in the
            uikit-default Inter MSDF atlas — unlike the U+25CB circle TasksWidget
            flagged); even were it ever absent, the words carry the meaning. */}
        <Text fontSize={11} letterSpacing={0.5} color={STUDIOLO.candleflame}>
          Open on the Page →
        </Text>
      </Button>
    </Container>
  );
}

/**
 * The rig hands each widget `{ slot, focused, lod }` (W-01's
 * `WidgetComponentProps`); W-07's drag wiring is threaded separately as an
 * optional `dragHandleProps` and passed straight through to `<WorldPanel>`.
 */
interface JournalWidgetProps extends WidgetComponentProps {
  dragHandleProps?: DragHandleProps;
}

export function JournalWidget({
  slot,
  focused,
  lod,
  dragHandleProps,
}: JournalWidgetProps): JSX.Element {
  const { journal, todayYmd } = useWorldData();
  const entry = journal.entry;

  // Derived in render, memoized on the entry identity (a fresh object each
  // refetch) — data cadence, never per frame.
  const { hasContent, preview, truncated, words } = useMemo(() => {
    const text = combineEntryText(entry);
    if (text.length === 0) {
      return { hasContent: false, preview: "", truncated: false, words: 0 };
    }
    const { preview, truncated } = extractPreview(text);
    return { hasContent: true, preview, truncated, words: countWords(text) };
  }, [entry]);

  // Reuse ModeToggle's ONE doorway: stash the journaling route (with today
  // selected) in its sessionStorage key, then fire the Cmd+\ keydown it listens
  // for. ModeToggle reads the key, pushes the route, and runs its own fade.
  const openOnPage = useCallback<PanelClick>((e) => {
    e.stopPropagation();
    try {
      sessionStorage.setItem(LAST_PAGE_KEY, `/journaling?date=${todayYmd}`);
    } catch {
      // sessionStorage unavailable — ModeToggle falls back to its default page,
      // so the doorway still opens; it just may not preselect today.
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "\\", metaKey: true, bubbles: true }),
    );
  }, [todayYmd]);

  return (
    <WorldPanel
      widgetId="journal"
      title="Journal"
      // Always "ready": we paint our own blank-line so the open-on-Page
      // affordance stays visible even when today's page is empty (the
      // primitive's empty branch would discard it — see OpenOnPageAffordance).
      status="ready"
      focused={focused}
      lod={lod}
      slot={slot}
      dragHandleProps={dragHandleProps}
    >
      {hasContent ? (
        <Container flexDirection="column" gap={6}>
          {/* The plain-text extraction. uikit honors the "\n" breaks; the
              content region scrolls, so a long preview never overflows. */}
          <Text fontSize={13} color={STUDIOLO.parchment}>
            {truncated ? `${preview}…` : preview}
          </Text>
          <Text
            fontSize={9}
            letterSpacing={0.5}
            color={STUDIOLO.brass}
            opacity={0.7}
          >
            {`${words} ${words === 1 ? "word" : "words"}`}
          </Text>
        </Container>
      ) : (
        // Blank page — the §2.8 quiet aside, rendered here (not via the
        // primitive's empty branch) so the affordance below stays visible.
        <Container>
          <Text fontSize={13} color={STUDIOLO.parchment} opacity={0.6}>
            Today&apos;s page is blank.
          </Text>
        </Container>
      )}

      <OpenOnPageAffordance onOpen={openOnPage} />
    </WorldPanel>
  );
}

export default JournalWidget;
