"use client";

/**
 * CapturesWidget.tsx — W-08 · The Studiolo · The Bottega (Phase 3)
 *
 * The inbox on the bench: fireflies get their ledger. A self-contained
 * `WidgetComponentProps` component that renders ITS content into the W-03
 * `<WorldPanel>` primitive (the shell owns the skin, frame, LOD split, honesty
 * states, and world-pick/summon plumbing — this unit only supplies rows + the
 * mutation wiring, exactly the TodayPanel doctrine WorldPanel cites).
 *
 * DATA (read-only, in RENDER, never per-frame): the captures slice already
 * mounted by the provider (W-01) at `[...tableKey("captures", userId), null]`
 * — read here as `useWorldData().captures` — plus the hashtags slice
 * (`tableKey("hashtags", userId)`, `useWorldData().hashtags`) W-01 added for the
 * per-row tag chips. Rows are newest-first, capped at `PANEL_ROW_CAP` with an
 * "and N more" footer; derivations are memoized on data/interaction identity.
 *
 * THE REMOVAL IS THE REAL ONE. The row's primary affordance mirrors the 2D
 * `CapturesClient`/`CaptureCard`'s only row-level mutation — Delete — calling
 * the SAME server action (`deleteCapture(id)` from `app/actions/captures.ts`)
 * with the SAME optimistic pattern the world already lives by (TodayPanel's
 * local `removed` Set to slide the row out; the 2D feed's own optimism via
 * `useOptimisticList` justifies optimism here) and the SAME cache key the 2D
 * captures subscription fans an invalidate onto — `tableKey("captures", userId)`
 * (the prefix shared by the provider's `[…captures, null]` slice AND every 2D
 * `[…captures, tag]` slice). That mutation flows DB → Supabase Realtime → the
 * ONE shared TanStack Query cache (the provider observes the identical key) →
 * the row leaves BOTH theatres. We deliberately do NOTHING on success beyond
 * the invalidate; the `capture-created` firefly/chime differ is upstream and
 * unaware of us (its behavior is untouched).
 *
 * We do NOT invent affordances the 2D app lacks: `updateCapture` is the 2D
 * detail-panel edit surface, not a row primary action, so there is no inline
 * edit here — only the delete the card exposes. No confirm dialog / undo toast
 * (uikit has no Dialog/sonner surface in-world); the optimistic slide + toast is
 * the world translation of the 2D flow.
 *
 * PERF (PLAN §6/§7.2): rows derived in render (memoized), never per-frame; no
 * `useFrame`, no ref mutation, no `invalidate()`. Content changes only when the
 * captures/hashtags queries refetch or the optimistic Set changes. uikit owns
 * its own draw batches and sleeps in demand mode between discrete changes.
 */

import { type JSX, useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Container, Text } from "@react-three/uikit";
import { Button } from "@react-three/uikit-default";
import { deleteCapture } from "@/app/actions/captures";
import { tableKey } from "@/lib/realtime/query-keys";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { useWorldData } from "../data/useWorldData";
import { STUDIOLO } from "../materials/tokens";
import { PANEL_ROW_CAP, WorldPanel } from "./WorldPanel";
import type { WidgetComponentProps } from "./widgetRegistry";

/** uikit/R3F pointer events expose `stopPropagation`; that's all we need. */
type PanelClick = (event: { stopPropagation: () => void }) => void;

/** Cap the chips rendered per row so a heavily-tagged capture never overflows. */
const CHIP_CAP = 4;
/** ~2 lines at fontSize 13 (line box ≈ 16 px) — the 2-line clamp, uikit-side. */
const CLAMP_HEIGHT = 34;

export function CapturesWidget({ slot, focused, lod }: WidgetComponentProps): JSX.Element {
  const { userId, captures, hashtags } = useWorldData();
  const queryClient = useQueryClient();

  // Optimistic hide — mirrors TodayPanel.handleComplete exactly. A row is
  // hidden the instant it is deleted; cleared after the invalidate settles (or
  // on failure, so it snaps back). The 2D feed carries its own optimism
  // (useOptimisticList), so an optimistic slide here is faithful, not invented.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // id → live displayName, derived from the provider's hashtags slice (W-01),
  // so a rename in one theatre re-labels the chip in the other. Falls back to
  // the capture's own carried displayName if the slice hasn't caught the tag.
  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of hashtags) m.set(h.id, h.displayName);
    return m;
  }, [hashtags]);

  // Newest-first, minus optimistically-removed rows. Recomputes only when the
  // captures array or the optimistic Set changes — data/interaction cadence,
  // never per frame. (The provider already returns desc(createdAt); we sort
  // defensively so ordering never depends on that being preserved upstream.)
  const rows = useMemo<CaptureWithLinks[]>(() => {
    const selected = captures.filter((c) => !removed.has(c.id));
    selected.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return selected;
  }, [captures, removed]);

  const visible = rows.slice(0, PANEL_ROW_CAP);
  const overflow = rows.length - visible.length;

  const handleDelete = useCallback(
    async (capture: CaptureWithLinks) => {
      // Optimistic: slide the row out immediately (D-02 — no dim/spinner).
      setRemoved((prev) => new Set(prev).add(capture.id));

      const r = await deleteCapture(capture.id);

      if (!r.success) {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(capture.id);
          return next;
        });
        toast.error(r.error);
        return;
      }

      toast("Capture deleted.");

      // Invalidate the SAME key the 2D captures subscription fans an invalidate
      // onto (tableKey("captures", userId)) — the prefix the provider's
      // [...captures, null] slice AND every 2D [...captures, tag] slice share —
      // so the delete reaches BOTH theatres. Delay + clear the optimistic id
      // after, exactly like TodayPanel, so the row never flickers back before
      // the refetch lands.
      setTimeout(() => {
        void queryClient
          .invalidateQueries({ queryKey: tableKey("captures", userId) })
          .then(() => {
            setRemoved((prev) => {
              const next = new Set(prev);
              next.delete(capture.id);
              return next;
            });
          });
      }, 250);
    },
    [queryClient, userId],
  );

  const status = visible.length === 0 ? "empty" : "ready";
  const countChip = rows.length > 0 ? String(rows.length) : undefined;

  return (
    <WorldPanel
      widgetId="captures"
      title="Captures"
      countChip={countChip}
      status={status}
      emptyLine="Nothing drifting."
      focused={focused}
      lod={lod}
      slot={slot}
    >
      {visible.map((capture) => {
        // Chips derived from the hashtags slice, scoped to this capture's tags.
        const chips = capture.hashtags
          .slice(0, CHIP_CAP)
          .map((h) => ({ id: h.id, label: tagNameById.get(h.id) ?? h.displayName }));
        const chipOverflow = capture.hashtags.length - chips.length;
        // Age caption — same relative phrasing as the 2D card's RelativeTime
        // (date-fns formatDistanceToNow). Computed at render (data cadence).
        const age = formatDistanceToNow(capture.createdAt, { addSuffix: true });

        return (
          <Container
            key={capture.id}
            flexDirection="column"
            gap={4}
            paddingY={6}
            borderBottomWidth={1}
            borderColor={STUDIOLO.sepiaInk}
          >
            <Container flexDirection="row" alignItems="flex-start" gap={8}>
              <Container flexDirection="column" flexGrow={1} flexShrink={1} gap={3}>
                {/* Capture text — 2-line clamp via a bounded, overflow-hidden
                    box (uikit's default font has no CSS line-clamp; the height
                    cap + hidden overflow is the world-side equivalent). */}
                <Container maxHeight={CLAMP_HEIGHT} overflow="hidden">
                  <Text fontSize={13} color={STUDIOLO.parchment}>
                    {capture.content}
                  </Text>
                </Container>
                <Text
                  fontSize={9}
                  letterSpacing={0.5}
                  color={STUDIOLO.brass}
                  opacity={0.7}
                >
                  {age}
                </Text>
              </Container>

              {/* The one real mutation the 2D row exposes: delete. Always
                  visible (no hover state in R3F), dimmed to a quiet ember. */}
              <Button
                variant="ghost"
                size="sm"
                height={20}
                paddingX={8}
                borderRadius={6}
                onClick={
                  ((e) => {
                    e.stopPropagation();
                    void handleDelete(capture);
                  }) as PanelClick
                }
              >
                <Text
                  fontSize={9}
                  letterSpacing={1}
                  color={STUDIOLO.emberAlarm}
                  opacity={0.8}
                >
                  Delete
                </Text>
              </Button>
            </Container>

            {chips.length > 0 ? (
              <Container flexDirection="row" flexWrap="wrap" gap={4}>
                {chips.map((chip) => (
                  <Container
                    key={chip.id}
                    borderWidth={1}
                    borderColor={STUDIOLO.brass}
                    borderRadius={4}
                    paddingX={5}
                    paddingY={1}
                  >
                    <Text
                      fontSize={9}
                      letterSpacing={0.3}
                      color={STUDIOLO.brass}
                      opacity={0.85}
                    >
                      {`#${chip.label}`}
                    </Text>
                  </Container>
                ))}
                {chipOverflow > 0 ? (
                  <Text
                    fontSize={9}
                    letterSpacing={0.3}
                    color={STUDIOLO.parchment}
                    opacity={0.5}
                  >
                    {`+${chipOverflow}`}
                  </Text>
                ) : null}
              </Container>
            ) : null}
          </Container>
        );
      })}

      {overflow > 0 ? (
        <Container paddingY={6}>
          <Text
            fontSize={9}
            letterSpacing={0.5}
            color={STUDIOLO.parchment}
            opacity={0.5}
          >
            {`and ${overflow} more`}
          </Text>
        </Container>
      ) : null}
    </WorldPanel>
  );
}

export default CapturesWidget;
