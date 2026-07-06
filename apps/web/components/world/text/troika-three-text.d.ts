/**
 * Minimal ambient types for troika-three-text 0.52.4 (ships no .d.ts).
 * We only use `preloadFont` for the world's SDF glyph warm-up; @react-three/drei
 * provides the typed <Text> component we render with elsewhere.
 */
declare module "troika-three-text" {
  export interface PreloadFontOptions {
    font?: string;
    characters?: string | string[];
    sdfGlyphSize?: number;
  }
  export function preloadFont(
    options: PreloadFontOptions,
    callback: () => void,
  ): void;
}
