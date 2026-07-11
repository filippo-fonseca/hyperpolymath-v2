import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

export interface NativeWebviewBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function toPhysicalWebviewBounds(
  rect: ContentRect,
  scaleFactor: number,
): NativeWebviewBounds {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return {
    x: Math.round(rect.left * scale),
    y: Math.round(rect.top * scale),
    w: Math.max(1, Math.round(rect.width * scale)),
    h: Math.max(1, Math.round(rect.height * scale)),
  };
}

export async function physicalWebviewBounds(
  rect: ContentRect,
): Promise<NativeWebviewBounds> {
  let scaleFactor =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  try {
    scaleFactor = await getCurrentWindow().scaleFactor();
  } catch {
    // Browser-only Studio previews do not expose the Tauri window API.
  }
  return toPhysicalWebviewBounds(rect, scaleFactor);
}

export function createNativeWebview(
  label: string,
  url: string,
  bounds: NativeWebviewBounds,
): Promise<void> {
  return invoke("studio_webview_create", { label, url, ...bounds });
}

export function setNativeWebviewBounds(
  label: string,
  bounds: NativeWebviewBounds,
): Promise<void> {
  return invoke("studio_webview_set_bounds", { label, ...bounds });
}

export function showNativeWebview(label: string): Promise<void> {
  return invoke("studio_webview_show", { label });
}

export function hideNativeWebview(label: string): Promise<void> {
  return invoke("studio_webview_hide", { label });
}

export function destroyNativeWebview(label: string): Promise<void> {
  return invoke("studio_webview_destroy", { label });
}

export function navigateNativeWebview(
  label: string,
  url: string,
): Promise<void> {
  return invoke("studio_webview_navigate", { label, url });
}

export function useNativeWebviewSync(
  id: string,
  contentRect: ContentRect | null,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !contentRect) return;
    let cancelled = false;
    void physicalWebviewBounds(contentRect).then((bounds) => {
      if (!cancelled) void setNativeWebviewBounds(id, bounds).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [
    id,
    enabled,
    contentRect?.left,
    contentRect?.top,
    contentRect?.width,
    contentRect?.height,
  ]);
}
