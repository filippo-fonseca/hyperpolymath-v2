import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { studioBridge } from "@studio/bridge";
import { HUD_COLORS } from "@studio/tokens";

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

export function StudioApp() {
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
  } as CSSProperties;

  return (
    <div className="studio-shell" style={colors}>
      <div className="studio-rulers" aria-hidden="true" />
      <div className="studio-widget-stage" data-studio-stage />
      {import.meta.env.DEV ? (
        <output className="studio-state-chip" aria-live="polite">
          FSM&nbsp;·&nbsp;{jarvisState}
        </output>
      ) : null}
    </div>
  );
}

export function mountStudio(container: HTMLElement): void {
  createRoot(container).render(<StudioApp />);
}
