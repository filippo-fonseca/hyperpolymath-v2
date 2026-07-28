"use client";

import {
  clampPanelWidth,
  useIsomorphicLayoutEffect,
  useOptionalRightSlot,
  useRegisteredPanel,
  useRightSlot,
} from "@/components/shell/cockpit/right-slot-context";
import type { SidePanelProps } from "@/components/shell/cockpit/right-slot-context";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";

export type { SidePanelProps };

/**
 * SidePanel — the inline detail panel (SDC-1 §2.8).
 *
 * The reference is Shakuro's CoCreate: the panel is *part of the page*. Content
 * reflows around it. No portal, no `position: fixed`, no overlay, no backdrop,
 * no dimming, no shadow, no focus trap, no scroll lock. You keep working with
 * it open. It replaces every `fixed inset-0` detail panel and every Sheet used
 * to read or edit an entity; modals are reserved for destructive confirmation
 * and blocking multi-field creation.
 *
 * Mechanically it renders nothing where you put it. It registers itself into
 * the cockpit's right slot, and `SidePanelHost` (mounted exactly once, in the
 * shell) renders the chrome as a true grid sibling of the stage. That is what
 * makes the stage genuinely narrower rather than covered: the track widens on
 * `grid-template-columns`, which is the one sanctioned width animation in the
 * app. Your children keep their position in your tree, so every provider and
 * hook above them still works.
 *
 * Below `lg` (1024px) there is no room for a second column, so it degrades to
 * an overlay-less sheet.
 *
 * This file is U0-owned and frozen for wave 2. If it cannot express a panel you
 * need, that is a blocker for U0, not an edit.
 */
export function SidePanel(props: SidePanelProps) {
  const slot = useOptionalRightSlot();
  const generatedId = useId();
  const { open, onClose, side = "right", width, title, actions, footer, children } = props;

  const atLeastLg = slot?.atLeastLg ?? false;
  const inSlot = Boolean(slot) && atLeastLg;

  // Re-register on EVERY render while open. `children` are React elements, i.e.
  // plain objects recreated each render, so anything less leaves the host
  // rendering last render's content. Only the host subscribes to this store, so
  // re-registering cannot cascade back into this component.
  useIsomorphicLayoutEffect(() => {
    if (!inSlot || !open || !slot) return;
    slot.panelStore.set({ id: generatedId, props });
  });

  // The scalar half: what the grid needs to size the track. Guarded by real
  // dependencies so the provider re-renders on user action, not on every render.
  useEffect(() => {
    if (!inSlot || !open || !slot) return;
    slot.acquireSlot({ id: generatedId, width: clampPanelWidth(width), side });
    return () => {
      slot.releaseSlot(generatedId);
      slot.panelStore.clear(generatedId);
    };
  }, [inSlot, open, slot, generatedId, width, side]);

  if (inSlot) return null;

  // Below lg: an overlay-less sheet. `modal={false}` keeps the page behind
  // scrollable and interactive, which is the same promise the inline panel
  // makes at desktop widths.
  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side={side}
        overlay={false}
        showCloseButton={false}
        aria-label={typeof title === "string" ? title : "Side panel"}
        className="w-full gap-0 rounded-none border-l border-[var(--edge)] bg-[var(--surface)] p-0 shadow-none sm:max-w-none"
      >
        <PanelChrome
          title={title}
          actions={actions}
          footer={footer}
          onClose={onClose}
          fadeKey={generatedId}
          bodyClassName={props.bodyClassName}
          inSheet
        >
          {children}
        </PanelChrome>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The panel's visual shell. Shared by the inline (grid) rendering and the
 * below-`lg` sheet so the two never drift.
 */
function PanelChrome({
  title,
  actions,
  footer,
  onClose,
  fadeKey,
  inSheet = false,
  bodyClassName,
  children,
}: {
  title?: SidePanelProps["title"];
  actions?: SidePanelProps["actions"];
  footer?: SidePanelProps["footer"];
  bodyClassName?: SidePanelProps["bodyClassName"];
  onClose: () => void;
  /** Restarts the content fade when a different panel takes the slot. */
  fadeKey: string;
  /**
   * Rendering inside the below-`lg` sheet, where the heading must be Radix's
   * `Dialog.Title` for the dialog to be labelled. Outside a `Dialog.Root` that
   * component throws, so the inline path uses a plain heading.
   */
  inSheet?: boolean;
  children: SidePanelProps["children"];
}) {
  const reduceMotion = useReducedMotion();

  const heading = (
    <h2 className="min-w-0 flex-1 truncate text-title font-semibold text-[var(--ink)]">{title}</h2>
  );

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--edge)] px-4">
        {inSheet ? <SheetTitle asChild>{heading}</SheetTitle> : heading}
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            "text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out",
            "hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          )}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>

      {/* The content fades in 80ms after the track starts moving, so it lands
          once the width has settled. The panel itself never translates. */}
      <motion.div
        key={fadeKey}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.16, delay: 0.08 }}
        className={cn("sd-scroll-hover min-h-0 flex-1 overflow-y-auto p-4", bodyClassName)}
      >
        {children}
      </motion.div>

      {footer ? <div className="shrink-0 border-t border-[var(--edge)] p-4">{footer}</div> : null}
    </>
  );
}

/**
 * SidePanelHost — renders the registered panel as a grid sibling of the stage.
 *
 * Exactly one of these exists in the app and it lives in the cockpit shell. It
 * owns the two ways a panel closes that the feature cannot see: `Escape`, and a
 * route change. Both call the feature's own `onClose`, because the feature
 * stays the source of truth for `open`; the host never hides a panel
 * unilaterally. The registration clearing on unmount is the backstop for a
 * feature that ignores `onClose`.
 */
export function SidePanelHost() {
  const slot = useRightSlot();
  const registration = useRegisteredPanel(slot.panelStore);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  const onClose = registration?.props.onClose;

  // Escape closes, unless something nearer the event already handled it. The
  // guard is what keeps an open Radix dialog from losing its own Escape.
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // A route change closes the panel. Guarded against firing on first mount.
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    onClose?.();
  }, [pathname, onClose]);

  if (!slot.atLeastLg || !registration) return null;

  const { props } = registration;
  const side = props.side ?? "right";

  return (
    <aside
      role="complementary"
      aria-label={typeof props.title === "string" ? props.title : "Side panel"}
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden bg-[var(--surface)]",
        side === "left" ? "border-r border-[var(--edge)]" : "border-l border-[var(--edge)]"
      )}
    >
      <PanelChrome
        title={props.title}
        actions={props.actions}
        footer={props.footer}
        onClose={props.onClose}
        bodyClassName={props.bodyClassName}
        fadeKey={registration.id}
      >
        {props.children}
      </PanelChrome>
    </aside>
  );
}
