"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from "react";

type SegmentButtonProps = ComponentPropsWithoutRef<"button"> & {
  ref?: Ref<HTMLButtonElement>;
};

export type ExplorerBreadcrumbSegment = {
  id: string;
  label: string;
  current?: boolean;
  buttonProps?: SegmentButtonProps;
};

/**
 * When the trail is longer than this, collapse the middle into an ellipsis
 * menu. Keeps root + current always visible so nested folder paths never
 * stack/overlap in the tight explorer toolbar slot.
 *
 * Threshold 2 → `Wiki › Folder` stays inline; `Wiki › A › B` becomes
 * `Wiki › … › B` with A reachable from the hover menu.
 */
const COLLAPSE_AFTER = 2;

export function splitBreadcrumbSegments<T>(segments: T[]): {
  head: T[];
  collapsed: T[];
  tail: T[];
} {
  if (segments.length <= COLLAPSE_AFTER) {
    return { head: segments, collapsed: [], tail: [] };
  }
  return {
    head: segments.slice(0, 1),
    collapsed: segments.slice(1, -1),
    tail: segments.slice(-1),
  };
}

export function ExplorerBreadcrumbs({
  segments,
  renderSegment,
  className,
}: {
  segments: ExplorerBreadcrumbSegment[];
  renderSegment?: (segment: ExplorerBreadcrumbSegment, defaultNode: ReactNode) => ReactNode;
  className?: string;
}) {
  const { head, collapsed, tail } = splitBreadcrumbSegments(segments);
  const items =
    collapsed.length > 0
      ? ([
          ...head.map((segment) => ({ kind: "segment" as const, segment, truncate: false })),
          { kind: "collapsed" as const, segments: collapsed },
          ...tail.map((segment) => ({ kind: "segment" as const, segment, truncate: true })),
        ] as const)
      : segments.map((segment, index) => ({
          kind: "segment" as const,
          segment,
          // Only the leaf may truncate — earlier crumbs stay shrink-0 so they
          // never pile on top of each other in a tight toolbar slot.
          truncate: index === segments.length - 1 && segments.length > 1,
        }));

  return (
    <nav aria-label="Explorer breadcrumbs" className={cn("min-w-0 font-sans", className)}>
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((item, index) => {
          if (item.kind === "collapsed") {
            return (
              <li key="breadcrumb-collapsed" className="flex shrink-0 items-center gap-1">
                {index > 0 ? <BreadcrumbChevron /> : null}
                <CollapsedPathMenu segments={item.segments} renderSegment={renderSegment} />
              </li>
            );
          }

          return (
            <BreadcrumbItem
              key={item.segment.id}
              segment={item.segment}
              showChevron={index > 0}
              truncate={item.truncate}
              renderSegment={renderSegment}
            />
          );
        })}
      </ol>
    </nav>
  );
}

function BreadcrumbChevron() {
  return (
    <ChevronRight
      size={13}
      strokeWidth={1.7}
      className="shrink-0 text-[color-mix(in_oklch,var(--ink-muted)_70%,transparent)]"
      aria-hidden
    />
  );
}

function BreadcrumbItem({
  segment,
  showChevron,
  truncate,
  renderSegment,
}: {
  segment: ExplorerBreadcrumbSegment;
  showChevron: boolean;
  truncate: boolean;
  renderSegment?: (segment: ExplorerBreadcrumbSegment, defaultNode: ReactNode) => ReactNode;
}) {
  const isCurrent = Boolean(segment.current);
  const defaultNode = (
    <button
      type="button"
      aria-current={isCurrent ? "page" : undefined}
      title={truncate ? segment.label : undefined}
      {...segment.buttonProps}
      className={cn(
        "rounded-[6px] px-2 py-1 text-left text-[0.8rem]",
        // Fill the flex slot and ellipsize here — not via the parent ol clipping
        // mid-glyph when the toolbar runs out of room.
        truncate ? "block w-full min-w-0 truncate" : "shrink-0",
        "transition-[background-color,color] duration-[120ms] ease-out",
        isCurrent
          ? "pointer-events-none text-[var(--ink)]"
          : "text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] focus-visible:outline-none focus-visible:bg-[var(--sd-hover)] focus-visible:text-[var(--sd-ink)] focus-visible:shadow-[inset_0_0_0_1px_var(--sd-accent)]",
        segment.buttonProps?.className
      )}
    >
      {segment.label}
    </button>
  );

  const node = renderSegment ? renderSegment(segment, defaultNode) : defaultNode;

  return (
    <li
      className={cn(
        "flex items-center gap-1",
        truncate ? "min-w-0 flex-1 overflow-hidden" : "shrink-0"
      )}
      title={truncate ? segment.label : undefined}
    >
      {showChevron ? <BreadcrumbChevron /> : null}
      {truncate ? (
        <span className="min-w-0 flex-1 overflow-hidden [&_*]:min-w-0 [&_*]:max-w-full">
          {node}
        </span>
      ) : (
        node
      )}
    </li>
  );
}

/**
 * Ellipsis that reveals collapsed ancestors on hover (and click/focus).
 * Menu items remain clickable so you can jump to any folded folder.
 */
function CollapsedPathMenu({
  segments,
  renderSegment,
}: {
  segments: ExplorerBreadcrumbSegment[];
  renderSegment?: (segment: ExplorerBreadcrumbSegment, defaultNode: ReactNode) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMenu = () => {
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show ${segments.length} hidden folders`}
          aria-expanded={open}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          onFocus={openMenu}
          className={cn(
            "shrink-0 rounded-[6px] px-2 py-1 text-[0.8rem] tracking-wide text-[var(--sd-ink-dull)]",
            "transition-[background-color,color] duration-[120ms] ease-out",
            "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
            "focus-visible:outline-none focus-visible:bg-[var(--sd-hover)] focus-visible:text-[var(--sd-ink)] focus-visible:shadow-[inset_0_0_0_1px_var(--sd-accent)]",
            open && "bg-[var(--sd-hover)] text-[var(--sd-ink)]"
          )}
        >
          …
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto min-w-[12rem] max-w-[min(20rem,calc(100vw-2rem))] p-1.5"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ul className="flex flex-col gap-0.5" role="list">
          {segments.map((segment, index) => {
            const item = (
              <button
                type="button"
                {...segment.buttonProps}
                onClick={(event) => {
                  segment.buttonProps?.onClick?.(event);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[0.8rem] text-[var(--sd-ink)]",
                  "transition-[background-color] duration-[120ms] ease-out",
                  "hover:bg-[var(--sd-hover)] focus-visible:outline-none focus-visible:bg-[var(--sd-hover)] focus-visible:shadow-[inset_0_0_0_1px_var(--sd-accent)]",
                  segment.buttonProps?.className
                )}
              >
                <span
                  className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--sd-ink-faint)]"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="min-w-0 truncate">{segment.label}</span>
              </button>
            );

            return (
              <li key={segment.id}>{renderSegment ? renderSegment(segment, item) : item}</li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
