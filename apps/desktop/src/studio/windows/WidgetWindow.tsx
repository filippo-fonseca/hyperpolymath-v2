import * as React from "react";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Minus, Pin, X } from "lucide-react";
import { animate as animateValue, motion, useMotionValue, useReducedMotion } from "motion/react";

import {
  HUD_EASE_OUT_QUART,
  SD_ACCENT,
  SD_DURATION,
  SD_HAIRLINE,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
  STUDIO_COLORS,
  STUDIO_MONO,
} from "../tokens";
import {
  closeWidget,
  focusWidget,
  moveWidget,
  resizeWidget,
  stowWidget,
  type WidgetWindowInstance,
} from "../state/widget-windows";
import { WIDGET_CATALOG } from "./catalog";
import { clampToStage } from "./layout";
import { BurstBubble } from "./BurstBubble";
import { playDropPop } from "../sound/studio-sfx";
import {
  edgeOutwardDirection,
  shouldBurst,
  widgetEdgeProgress,
} from "./edge-burst";

/** Transient edge-burst state while a stowable widget is dragged near a border. */
interface BurstState {
  progress: number;
  direction: { x: number; y: number };
  popping: boolean;
}

interface Props {
  window: WidgetWindowInstance;
  onElement: (id: string, element: HTMLDivElement | null) => void;
  onDrawerTargetChange: (id: string, targeted: boolean) => void;
}

interface PointerSession {
  mode: "move" | "resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  start: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

export function applyWindowGeometry(
  element: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
): void {
  element.style.left = `${(rect.x - rect.w / 2) * 100}%`;
  element.style.top = `${(rect.y - rect.h / 2) * 100}%`;
  element.style.width = `${rect.w * 100}%`;
  element.style.height = `${rect.h * 100}%`;
}

const EASE = `cubic-bezier(${HUD_EASE_OUT_QUART.join(",")})`;

/**
 * THE HEADER / PADDING CONTRACT — widget authors (units 5a/5b) read this.
 *
 * The window owns its chrome and NOTHING else. Concretely:
 *
 * - The header is {@link WINDOW_HEADER_HEIGHT}px tall, drawn by this file, and
 *   already carries the widget's `catalog.label` as a mono eyebrow. A widget
 *   MUST NOT paint its own title bar; it would be the second one.
 * - The content region below it is `flex: 1; min-height: 0; overflow: hidden`
 *   with **zero padding**. That is deliberate and it is not an oversight: the
 *   Browser and Camera widgets are edge-to-edge, so the window cannot inset
 *   content without breaking them. **The widget owns its own padding.**
 * - Text-bearing widgets should use {@link WINDOW_CONTENT_PADDING}px so the
 *   catalog reads as one family. Edge-to-edge widgets use 0 and let their own
 *   surface run to the frame.
 * - The frame clips to a 14px radius, so a widget needs no corner rounding of
 *   its own. Inner surfaces go SOLID (`--sd-box` and friends): the glass is the
 *   frame's, sealed D1 keeps it there, and §0 bans blur on content.
 */
export const WINDOW_HEADER_HEIGHT = 32;

/** Inset for text-bearing widget content. Edge-to-edge widgets use 0. */
export const WINDOW_CONTENT_PADDING = 12;

/**
 * The glass-depth shadow stack. Sealed D1 keeps this and the 18px backdrop blur:
 * §0 bans blur on CONTENT, §5 permits it on CHROME, and a widget window is
 * chrome. What it is NOT is a lift affordance — it is CONSTANT now. It used to
 * take a `hover` flag that deepened the drop from 20/56 to 34/84, which is
 * exactly the levitation card v2 forbids; hover moves the border and nothing
 * else. The inset cyan breath is gone too: glass is translucency, not a glow,
 * and §1 does not glow (see the report for that judgement call).
 *
 * Three terms remain: an outer drop that separates the window from the canvas,
 * card v2's white inset top hairline, and a recessed bottom edge.
 */
const GLASS_SHADOW = [
  `0 20px 56px color-mix(in srgb, ${STUDIO_COLORS.shadow} 78%, transparent)`,
  SD_HAIRLINE.card,
  "inset 0 -1px 0 rgba(0, 0, 0, 0.4)",
].join(", ");

/**
 * Card v2, translated out of Tailwind: 14px radius, an --sd-box surface, a 1px
 * --sd-line border, and the inset top hairline (carried in GLASS_SHADOW). The
 * surface stays 90% opaque rather than solid so the retained blur has something
 * to refract — a solid fill would keep the token and quietly delete the glass.
 */
const frameStyle: CSSProperties = {
  position: "absolute",
  display: "flex",
  minHeight: 0,
  flexDirection: "column",
  overflow: "hidden",
  border: `1px solid ${SD_SURFACES.line}`,
  borderRadius: SD_RADIUS.card,
  color: SD_INK.base,
  background: `color-mix(in srgb, ${SD_SURFACES.box} 90%, transparent)`,
  boxShadow: GLASS_SHADOW,
  backdropFilter: "blur(18px)",
  transition: `border-color ${SD_DURATION.micro}ms ${EASE}, box-shadow ${SD_DURATION.micro}ms ${EASE}`,
  pointerEvents: "auto",
};

/**
 * Header pin/stow/close. A bare icon button has no border to move, so hover
 * takes a fill rung here (`.studio-chrome-btn` in studio.css) — the card v2
 * border-only rule governs cards, and this is not one.
 */
const chromeButtonStyle: CSSProperties = {
  display: "grid",
  width: 24,
  height: 24,
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: SD_RADIUS.chrome,
  color: SD_INK.faint,
  background: "transparent",
  cursor: "pointer",
};

function isNearDrawer(clientX: number, clientY: number): boolean {
  const drawer = document.querySelector<HTMLElement>("[data-widget-drawer]");
  const rect = drawer?.getBoundingClientRect();
  // Position-agnostic proximity: a widget dragged within a generous margin of
  // the drawer's box counts as "near" so the drawer highlights and a release
  // stows it. The drawer now lives on the right edge, so this is intentionally
  // symmetric rather than the old bottom-only test.
  const MARGIN = 84;
  return Boolean(
    rect &&
      clientX >= rect.left - MARGIN &&
      clientX <= rect.right + MARGIN &&
      clientY >= rect.top - MARGIN &&
      clientY <= rect.bottom + MARGIN,
  );
}

export function WidgetWindow({
  window: item,
  onElement,
  onDrawerTargetChange,
}: Props): React.ReactElement {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  // Permanent widgets (the orb) are positioned through motion values so drag
  // updates and the settle animation share ONE source of truth. Driving the
  // position with `animate={{ left: item.x }}` instead produced the drop
  // whiplash: geometry applied imperatively during the drag never reached
  // motion's internal target, so on release the spring first snapped the orb
  // back to its pre-drag origin, then jumped to the new position once state
  // updated. Motion values eliminate that stale-target replay.
  const leftMv = useMotionValue(`${(item.x - item.w / 2) * 100}%`);
  const topMv = useMotionValue(`${(item.y - item.h / 2) * 100}%`);
  const widthMv = useMotionValue(`${item.w * 100}%`);
  const heightMv = useMotionValue(`${item.h * 100}%`);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [burst, setBurst] = useState<BurstState | null>(null);
  const entry = WIDGET_CATALOG[item.kind];
  const catalogEntry = entry as typeof entry & { permanent?: boolean };
  const stowable =
    item.kind !== ("orb" as WidgetWindowInstance["kind"]) &&
    catalogEntry.permanent !== true;
  const Content = entry.component;
  const permanent = entry.permanent === true;

  // When the committed geometry changes (a settled drop, a resize, or an
  // external move) settle the permanent widget's motion values toward it with a
  // gentle spring — but never mid-drag, where the drag handler owns the values
  // directly. Because the values already hold the drag's last position, the
  // spring starts from exactly where the orb was released: no back-snap, no
  // jump. Reduced motion sets the values instantly.
  const targetLeft = `${(item.x - item.w / 2) * 100}%`;
  const targetTop = `${(item.y - item.h / 2) * 100}%`;
  const targetWidth = `${item.w * 100}%`;
  const targetHeight = `${item.h * 100}%`;
  useEffect(() => {
    if (!permanent || draggingRef.current) return;
    if (reduced) {
      leftMv.set(targetLeft);
      topMv.set(targetTop);
      widthMv.set(targetWidth);
      heightMv.set(targetHeight);
      return;
    }
    const spring = { type: "spring", stiffness: 220, damping: 30, mass: 0.7 } as const;
    const controls = [
      animateValue(leftMv, targetLeft, spring),
      animateValue(topMv, targetTop, spring),
      animateValue(widthMv, targetWidth, spring),
      animateValue(heightMv, targetHeight, spring),
    ];
    return () => {
      for (const control of controls) control.stop();
    };
  }, [
    permanent,
    reduced,
    targetLeft,
    targetTop,
    targetWidth,
    targetHeight,
    leftMv,
    topMv,
    widthMv,
    heightMv,
  ]);

  const setRoot = (element: HTMLDivElement | null): void => {
    rootRef.current = element;
    onElement(item.id, element);
  };

  const stowFromHeader = (): void => {
    onDrawerTargetChange(item.id, true);
    requestAnimationFrame(() => {
      stowWidget(item.id);
      onDrawerTargetChange(item.id, false);
    });
  };

  const startPointer = (
    mode: PointerSession["mode"],
    event: PointerEvent<HTMLElement>,
  ): void => {
    if (event.button !== 0) return;
    focusWidget(item.id);
    sessionRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      start: { x: item.x, y: item.y, w: item.w, h: item.h },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: PointerEvent<HTMLElement>): void => {
    const session = sessionRef.current;
    const root = rootRef.current;
    const stage = root?.parentElement?.getBoundingClientRect();
    if (
      !session ||
      session.pointerId !== event.pointerId ||
      !root ||
      !stage?.width ||
      !stage.height
    ) {
      return;
    }
    const dxPx = event.clientX - session.startClientX;
    const dyPx = event.clientY - session.startClientY;
    if (!session.moved && Math.hypot(dxPx, dyPx) < 4) return;
    session.moved = true;
    draggingRef.current = true;
    if (!dragging) setDragging(true);
    // The RAW (unclamped) center drives the edge-burst affordance so pushing
    // a widget INTO / past the border is expressible even though the applied
    // geometry is clamped to stay on-stage.
    const rawCenter =
      session.mode === "move"
        ? {
            x: session.start.x + dxPx / stage.width,
            y: session.start.y + dyPx / stage.height,
          }
        : { x: session.start.x, y: session.start.y };
    const rect =
      session.mode === "move"
        ? clampToStage({ ...session.start, x: rawCenter.x, y: rawCenter.y })
        : clampToStage({
            ...session.start,
            w: session.start.w + dxPx / stage.width,
            h: session.start.h + dyPx / stage.height,
          });
    // Permanent widgets are motion-value driven: set the values directly (no
    // spring) so the orb tracks the pointer 1:1. Everything else keeps the
    // imperative geometry path (its `animate` re-applies committed state on
    // the settle re-render).
    if (permanent) {
      leftMv.set(`${(rect.x - rect.w / 2) * 100}%`);
      topMv.set(`${(rect.y - rect.h / 2) * 100}%`);
      widthMv.set(`${rect.w * 100}%`);
      heightMv.set(`${rect.h * 100}%`);
    } else {
      applyWindowGeometry(root, rect);
    }
    if (session.mode === "move" && stowable) {
      const progress = widgetEdgeProgress(rawCenter);
      setBurst(
        progress > 0
          ? {
              progress,
              direction: edgeOutwardDirection(rawCenter),
              popping: false,
            }
          : null,
      );
      // While the burst affordance is armed, the near-border pull owns the
      // gesture; don't also flag the drawer as a target (avoids a double cue).
      onDrawerTargetChange(
        item.id,
        progress <= 0 && isNearDrawer(event.clientX, event.clientY),
      );
    }
  };

  const endPointer = (
    event: PointerEvent<HTMLElement>,
    cancelled = false,
  ): void => {
    const session = sessionRef.current;
    const root = rootRef.current;
    const stage = root?.parentElement?.getBoundingClientRect();
    sessionRef.current = null;
    // Release the drag lock BEFORE committing state so the settle effect runs
    // on the re-render. The motion values still hold the released position, so
    // the spring starts exactly there — no back-snap to the pre-drag origin.
    draggingRef.current = false;
    setDragging(false);
    onDrawerTargetChange(item.id, false);
    if (
      !session?.moved ||
      session.pointerId !== event.pointerId ||
      !stage?.width ||
      !stage.height
    ) {
      setBurst(null);
      return;
    }
    const dx = (event.clientX - session.startClientX) / stage.width;
    const dy = (event.clientY - session.startClientY) / stage.height;
    if (session.mode === "move") {
      const rawCenter = { x: session.start.x + dx, y: session.start.y + dy };
      // Past the burst threshold → pop and stow (drawer-stow lifecycle: a chip
      // appears in the drawer, restorable). The pop plays, then we stow.
      if (!cancelled && stowable && shouldBurst(widgetEdgeProgress(rawCenter))) {
        setBurst((current) =>
          current
            ? { ...current, progress: 1, popping: true }
            : {
                progress: 1,
                direction: edgeOutwardDirection(rawCenter),
                popping: true,
              },
        );
        window.setTimeout(() => stowWidget(item.id), reduced ? 0 : 220);
        return;
      }
      // Released before the threshold → deflate the bubble and let the widget
      // spring back to its clamped, safe position (the forgiving escape).
      setBurst(null);
      if (!cancelled && stowable && isNearDrawer(event.clientX, event.clientY)) {
        stowWidget(item.id);
        return;
      }
      moveWidget(item.id, rawCenter.x, rawCenter.y);
      // Soft pop as the widget settles under the release point.
      if (!cancelled) playDropPop();
    } else {
      resizeWidget(item.id, session.start.w + dx, session.start.h + dy);
    }
  };

  return (
    <motion.div
      ref={setRoot}
      data-widget-window={item.id}
      role="dialog"
      aria-label={entry.label}
      onPointerDown={(event) => {
        if (permanent) startPointer("move", event);
        else focusWidget(item.id);
      }}
      onPointerMove={permanent ? movePointer : undefined}
      onPointerUp={permanent ? endPointer : undefined}
      onPointerCancel={permanent ? endPointer : undefined}
      onPointerEnter={permanent ? undefined : () => setHovered(true)}
      onPointerLeave={permanent ? undefined : () => setHovered(false)}
      onFocus={permanent ? undefined : () => setFocused(true)}
      onBlur={permanent ? undefined : (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      // The orb (permanent) is NEVER stowed, so it needs no shared-element
      // layout transition — and giving it a `layoutId` made motion replay a
      // layout animation from the stale pre-drag box on every drop, part of the
      // whiplash. Only stowable widgets, which morph to/from a drawer chip, get
      // the layoutId.
      layoutId={permanent ? undefined : `widget:${item.id}`}
      animate={
        permanent
          ? { opacity: 1, scale: 1 }
          : {
              opacity: 1,
              // Drag-feel: a subtle lift while grabbed, and the widget deflates
              // INTO the bubble skin as burst progress rises (the "shrinking
              // into a bubble about to pop" affordance).
              scale: reduced
                ? 1
                : dragging
                  ? 1.02 - (burst?.progress ?? 0) * 0.16
                  : 1,
            }
      }
      exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      transition={
        permanent
          ? reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 82, damping: 20, mass: 0.9 }
          : dragging || burst
            ? reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 26, mass: 0.7 }
            : { duration: reduced ? 0 : 0.18 }
      }
      style={{
        ...frameStyle,
        ...(permanent
          ? {
              border: 0,
              borderRadius: "50%",
              background: "transparent",
              boxShadow: "none",
              backdropFilter: "none",
              cursor: "grab",
              touchAction: "none",
            }
          : null),
        // Card v2 hover: the BORDER moves, nothing else. No fill change, no
        // deepened drop, no lift. Focus is the one exception and it is not a
        // hover state — it adds the 1px inset accent ring a keyboard user needs
        // on top of the unchanged resting shadow.
        ...(!permanent && (dragging || hovered || focused)
          ? {
              borderColor: `color-mix(in srgb, ${SD_ACCENT} ${dragging ? 55 : 40}%, ${SD_SURFACES.line})`,
              ...(focused
                ? { boxShadow: `${GLASS_SHADOW}, inset 0 0 0 1px ${SD_ACCENT}` }
                : null),
              ...(dragging ? { cursor: "grabbing" } : null),
            }
          : null),
        // Permanent widgets read position from the shared motion values (drag +
        // settle use the same source, so a drop lands exactly under the pointer
        // and settles with at most a whisper of spring). Others stay on
        // item-derived strings, re-applied on the settle re-render.
        left: permanent ? leftMv : `${(item.x - item.w / 2) * 100}%`,
        top: permanent ? topMv : `${(item.y - item.h / 2) * 100}%`,
        width: permanent ? widthMv : `${item.w * 100}%`,
        height: permanent ? heightMv : `${item.h * 100}%`,
        zIndex: dragging && !permanent ? 9_000 : item.z,
      }}
    >
      {burst ? (
        <BurstBubble
          progress={burst.progress}
          popping={burst.popping}
          direction={burst.direction}
        />
      ) : null}
      {permanent ? null : (
        <header
          style={{
            display: "flex",
            height: WINDOW_HEADER_HEIGHT,
            flexShrink: 0,
            touchAction: "none",
            alignItems: "center",
            gap: 8,
            padding: "0 8px 0 10px",
            background: `color-mix(in srgb, ${SD_SURFACES.darkBox} 72%, transparent)`,
            borderBottom: `1px solid ${SD_SURFACES.line}`,
            cursor: "grab",
          }}
          onPointerDown={(event) => startPointer("move", event)}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={(event) => endPointer(event, true)}
        >
          <span
            style={{
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
              color: SD_INK.dull,
              fontFamily: STUDIO_MONO,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.1em",
              textOverflow: "ellipsis",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {entry.label}
          </span>
          <button
            type="button"
            aria-label="Pin window to front"
            title="Pin to front"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => focusWidget(item.id)}
            className="studio-chrome-btn"
            style={chromeButtonStyle}
          >
            <Pin size={12} aria-hidden />
          </button>
          {stowable ? (
            <button
              type="button"
              aria-label="Stow window"
              title="Stow"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={stowFromHeader}
              className="studio-chrome-btn"
              style={chromeButtonStyle}
            >
              <Minus size={13} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close window"
            title="Close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => closeWidget(item.id)}
            className="studio-chrome-btn"
            style={chromeButtonStyle}
          >
            <X size={13} aria-hidden />
          </button>
        </header>
      )}

      <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
        <Suspense
          fallback={
            <div
              aria-label="Loading widget"
              style={{ height: "100%", background: SD_SURFACES.box }}
            />
          }
        >
          <Content id={item.id} props={item.props} />
        </Suspense>
      </div>

      {permanent ? null : (
        <button
          type="button"
          aria-label="Resize window"
          title="Resize"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 20,
            height: 20,
            touchAction: "none",
            border: 0,
            // The grip is an affordance, not a signal: it reads as a faint ink
            // corner rather than the accent bracket it used to be, which fought
            // the header for attention on every window at once.
            borderRight: `2px solid ${SD_INK.faint}`,
            borderBottom: `2px solid ${SD_INK.faint}`,
            borderBottomRightRadius: SD_RADIUS.card - 1,
            background: "transparent",
            cursor: "nwse-resize",
          }}
          onPointerDown={(event) => startPointer("resize", event)}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={(event) => endPointer(event, true)}
        />
      )}
    </motion.div>
  );
}
