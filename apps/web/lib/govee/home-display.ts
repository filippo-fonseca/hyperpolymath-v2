/**
 * Client-safe display helpers for Govee home lights (sidebar + shared UI).
 * Keep this free of `server-only` so client components can import it.
 */

export interface HomeLightDeviceView {
  name: string;
  sku: string;
  deviceId: string;
  isDefault: boolean;
  on: boolean | null;
  brightness: number | null;
  rgb: number | null;
  kelvin: number | null;
  /** Human label for scene / music / work mode when Govee reports one. */
  mode: string | null;
  stateError?: string;
}

export interface HomeLightsReceiptView {
  devices: HomeLightDeviceView[];
  count: number;
  connected: boolean;
  hint?: string;
}

export function rgbToCss(rgb: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(rgb)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

/** Swatch fill from RGB or a warm→cool kelvin approximation. */
export function swatchColor(light: Pick<HomeLightDeviceView, "rgb" | "kelvin">): string | null {
  if (light.rgb != null) return rgbToCss(light.rgb);
  if (light.kelvin != null) {
    const t = Math.max(0, Math.min(1, (light.kelvin - 2000) / 7000));
    const warm = { r: 255, g: 197, b: 143 };
    const cool = { r: 214, g: 226, b: 255 };
    const r = Math.round(warm.r + (cool.r - warm.r) * t);
    const g = Math.round(warm.g + (cool.g - warm.g) * t);
    const b = Math.round(warm.b + (cool.b - warm.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return null;
}

export function formatLightMeta(light: HomeLightDeviceView): string {
  const parts: string[] = [];
  if (typeof light.brightness === "number") parts.push(`${light.brightness}%`);
  if (light.mode) parts.push(light.mode);
  else if (typeof light.kelvin === "number" && light.rgb == null) parts.push(`${light.kelvin}K`);
  return parts.join(" · ");
}
