import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";

import { studioBridge } from "@studio/bridge";
import { HUD_COLORS, HUD_SURFACES } from "@studio/tokens";
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

  const colors = {
    "--studio-canvas": HUD_COLORS.canvas,
    "--studio-canvas-raised": HUD_COLORS.canvasRaised,
    "--studio-grid": HUD_COLORS.grid,
    "--studio-rule": HUD_COLORS.rule,
    "--studio-accent": HUD_COLORS.accent,
    "--studio-accent-high": HUD_COLORS.accentHigh,
    "--studio-text": HUD_COLORS.text,
    "--studio-muted": HUD_COLORS.muted,
    "--studio-surface-sunken": HUD_SURFACES.sunken,
    "--studio-surface-base": HUD_SURFACES.base,
    "--studio-surface-raised": HUD_SURFACES.raised,
    "--studio-surface-hover": HUD_SURFACES.hover,
    "--studio-line": HUD_SURFACES.line,
    "--studio-line-strong": HUD_SURFACES.lineStrong,
  } as CSSProperties;

  return (
    <div className="studio-shell" style={colors}>
      <ConstellationCanvas />
      <div className="studio-rulers" aria-hidden="true" />
      {createPortal(
        <div className="studio-widget-stage" data-studio-stage>
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
