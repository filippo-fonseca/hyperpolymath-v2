import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";

import { studioBridge } from "@studio/bridge";
import {
  SD_ACCENT,
  SD_ACCENT_DEEP,
  SD_ACCENT_FAINT,
  SD_DURATION,
  SD_FONT,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
} from "@studio/tokens";
import { ConstellationCanvas } from "@studio/background/ConstellationCanvas";
import { WidgetWindowLayer } from "@studio/windows/WidgetWindowLayer";

import "@studio/studio.css";

function subscribeToJarvisState(onStoreChange: () => void): () => void {
  return studioBridge.on("jarvisState", onStoreChange);
}

function useJarvisState() {
  return useSyncExternalStore(
    subscribeToJarvisState,
    studioBridge.getJarvisState,
    studioBridge.getJarvisState,
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * The sd vocabulary, declared as custom properties on the Studio's own roots.
 *
 * `src/styles/sd-tokens.css` is the source of truth and declares these same
 * names on `:root` — but only for entries that import it, which today is the
 * debug stage alone (index.html's wiring belongs to the HUD unit). Declaring
 * them here too means the Studio carries its own vocabulary and paints
 * correctly through either entry; the values are mirrored from `tokens.ts`, so
 * a `:root` copy and this one always agree.
 *
 * It is applied to BOTH roots on purpose. The widget layer is portaled into a
 * sibling host, outside `.studio-shell`, so it would otherwise inherit none of
 * these and every `var(--sd-*)` in the window chrome would fall back.
 */
const SD_SCOPE = {
  "--sd-accent": SD_ACCENT,
  "--sd-accent-faint": SD_ACCENT_FAINT,
  "--sd-accent-deep": SD_ACCENT_DEEP,
  "--sd-ink": SD_INK.base,
  "--sd-ink-dull": SD_INK.dull,
  "--sd-ink-faint": SD_INK.faint,
  "--sd-app": SD_SURFACES.app,
  "--sd-box": SD_SURFACES.box,
  "--sd-dark-box": SD_SURFACES.darkBox,
  "--sd-darker-box": SD_SURFACES.darkerBox,
  "--sd-line": SD_SURFACES.line,
  "--sd-hover": SD_SURFACES.hover,
  "--sd-selected": SD_SURFACES.selected,
  "--r-chip": `${SD_RADIUS.chip}px`,
  "--r-chrome": `${SD_RADIUS.chrome}px`,
  "--r-tile": `${SD_RADIUS.tile}px`,
  "--r-card": `${SD_RADIUS.card}px`,
  "--font-mono": SD_FONT.mono,
  "--dur-micro": `${SD_DURATION.micro}ms`,
  "--dur-entrance": `${SD_DURATION.entrance}ms`,
} as CSSProperties;

interface StudioAppProps {
  widgetHost: HTMLElement;
}

export function StudioApp({ widgetHost }: StudioAppProps) {
  const jarvisState = useJarvisState();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const isFullscreenShortcut =
        event.key === "F11" ||
        (event.metaKey && event.shiftKey && event.key.toLowerCase() === "f");
      if (!isFullscreenShortcut) return;
      event.preventDefault();
      void studioBridge.toggleFullscreen().catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[studio] fullscreen toggle failed", error);
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="studio-shell" style={SD_SCOPE}>
      <ConstellationCanvas />
      <div className="studio-rulers" aria-hidden="true" />
      {createPortal(
        <div className="studio-widget-stage" style={SD_SCOPE} data-studio-stage>
          <WidgetWindowLayer />
        </div>,
        widgetHost,
      )}
      {import.meta.env.DEV ? (
        <output className="studio-state-chip" aria-live="polite">
          FSM&nbsp;·&nbsp;{jarvisState}
        </output>
      ) : null}
    </div>
  );
}

export function mountStudio(container: HTMLElement): void {
  const widgetHost = document.createElement("div");
  widgetHost.id = "studio-widget-root";
  container.after(widgetHost);
  createRoot(container).render(<StudioApp widgetHost={widgetHost} />);
}
