"use client";

import { useRouter } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { entityHref } from "@/lib/entity-href";
import { ENTITY_KIND_GLYPH } from "@/lib/references/glyphs";
import type { EntityRef, EntityRefType } from "@/lib/references/token";
import { cn } from "@/lib/utils";
import { useResolvedLabel } from "./use-entity-labels";

/**
 * The rendered form of a reference token (S7).
 *
 * One pill, every surface: a capture body, a task title, a JARVIS bubble, a
 * search result. The token in the text is the same everywhere, so the chip it
 * becomes should be too.
 *
 * Three states, and the distinction between the last two matters:
 *   - resolved      → the live label, navigable.
 *   - unresolved    → the snapshot label, still navigable. Nothing has answered
 *                     yet (no provider above it, or the batch is in flight).
 *                     Optimistic on purpose: assuming the target exists is
 *                     right almost always, and it means pills never flicker
 *                     from tombstone to live as a query settles.
 *   - exists: false → tombstone. The server looked and the target is gone.
 *
 * Never an `<a>`: an anchor would need an href on the tombstone too, and app
 * navigation here goes through the router like every other chip in the app
 * (see components/pages/EntityReferenceInline.tsx for the editor's variant,
 * which *is* an anchor precisely because it must survive a copy-paste out of a
 * document). No innerHTML anywhere — the label is text, and text is a child.
 */

/** Human-facing kind name, for the tooltip's header and the a11y label. */
const KIND_NAME: Record<EntityRefType, string> = {
  area: "Area",
  project: "Project",
  task: "Task",
  page: "Page",
  capture: "Capture",
  person: "Person",
};

export function EntityPill({
  entityRef,
  className,
  asButton = true,
}: {
  entityRef: EntityRef;
  className?: string;
  /**
   * `false` renders a plain `<span>`, matching HashtagChip/PersonChip's escape
   * hatch. Required wherever the pill sits inside something already clickable
   * — a search result row is itself a `<button>`, and a nested button is
   * invalid DOM.
   */
  asButton?: boolean;
}) {
  const router = useRouter();
  const resolved = useResolvedLabel(entityRef.type, entityRef.id);

  // Only an explicit exists:false is a tombstone. Undefined means unanswered.
  const isTombstone = resolved?.exists === false;
  const snapshot = entityRef.label.trim();
  // An entity can be real and still have no name (an untitled page), so fall
  // through the ladder rather than trusting the live label's mere presence.
  const label = resolved?.label.trim() || snapshot || "Untitled";
  const glyph = resolved?.emoji || ENTITY_KIND_GLYPH[entityRef.type];
  const kindName = KIND_NAME[entityRef.type];

  const body = (
    <>
      <span className="entity-pill-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="entity-pill-label">{label}</span>
    </>
  );

  // A tombstone is inert regardless of `asButton`: there is nowhere to go.
  if (isTombstone) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn("entity-pill entity-pill-tombstone", className)}
              data-kind={entityRef.type}
              data-tombstone="true"
            >
              {body}
            </span>
          </TooltipTrigger>
          <TooltipContent>{`${kindName} · deleted`}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Static: the entity is live, so it keeps its normal register — it simply
  // isn't independently clickable, because something above it already is.
  const trigger = asButton ? (
    <button
      type="button"
      className={cn("entity-pill", className)}
      data-kind={entityRef.type}
      aria-label={`${kindName}: ${label}`}
      onClick={(e) => {
        // Cards and rows are themselves clickable; opening the card *and* the
        // reference on one click would be a race.
        e.stopPropagation();
        router.push(entityHref({ kind: entityRef.type, id: entityRef.id }));
      }}
    >
      {body}
    </button>
  ) : (
    <span className={cn("entity-pill", className)} data-kind={entityRef.type}>
      {body}
    </span>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="max-w-[280px] normal-case tracking-normal">
          <EntityPreview
            kindName={kindName}
            label={label}
            sublabel={resolved?.sublabel}
            context={resolved?.context}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * The hover card: what this thing is, what it's called, and a couple of lines
 * of it. Deliberately thin — it reads from the resolve payload the pills
 * already fetched, so hovering costs nothing extra.
 */
function EntityPreview({
  kindName,
  label,
  sublabel,
  context,
}: {
  kindName: string;
  label: string;
  sublabel?: string;
  context?: string;
}) {
  return (
    <span className="flex flex-col gap-1 py-0.5 text-left">
 <span className="text-micro text-[var(--sd-ink-faint)]">
        {sublabel ? `${kindName} · ${sublabel}` : kindName}
      </span>
 <span className="text-meta leading-[1.35] text-[var(--sd-ink)]">
        {label}
      </span>
      {context ? (
 <span className="line-clamp-2 text-micro leading-[1.4] text-[var(--sd-ink-dull)]">
          {context}
        </span>
      ) : null}
    </span>
  );
}
