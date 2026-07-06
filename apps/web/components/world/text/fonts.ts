/**
 * World font URL constants and preload helper.
 *
 * Troika (the SDF renderer behind @react-three/drei <Text>) needs a real
 * font binary URL — next/font/google does not expose one. These TTF files
 * are committed to public/world/fonts/ and served statically by Next.js.
 *
 * Usage:
 *   import { EB_GARAMOND_REGULAR, EB_GARAMOND_ITALIC, preloadWorldFonts } from './fonts';
 *   // In WorldCanvas mount effect:
 *   preloadWorldFonts();
 *   // In <Text> components:
 *   <Text font={EB_GARAMOND_REGULAR} ...>area name</Text>
 *   <Text font={EB_GARAMOND_ITALIC} ...>ledger line</Text>
 */

// Public-path constants — consumed by <Text font={...}> throughout the world.
export const EB_GARAMOND_REGULAR = '/world/fonts/EBGaramond-Regular.ttf' as const;
export const EB_GARAMOND_ITALIC = '/world/fonts/EBGaramond-Italic.ttf' as const;

/**
 * The glyph set to preload: ASCII printable range + common date punctuation.
 *
 * Covers every character needed for:
 *   - Area / project / task captions
 *   - The Ledger strip ("N tasks due · next event · M unfiled")
 *   - Ribbon text from Jarvis SSE deltas
 *   - Date strings ("Mon 7 Jul", "2026-07-06", etc.)
 */
export const WORLD_GLYPH_SET =
  // ASCII printable (space → ~)
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  // Common date / time punctuation not in ASCII printable
  // (middle dot, en/em dash, curly single+double quotes, ellipsis — escaped to
  //  avoid the ASCII-apostrophe-vs-string-delimiter hazard)
  '\u00B7\u2013\u2014\u2018\u2019\u201C\u201D\u2026';

/**
 * Preload both world fonts with the full glyph set so troika builds the
 * SDF atlas before first paint — prevents glyph-atlas pop after boot.
 *
 * Call once from WorldCanvas (or WorldLoader) before mounting <Text> nodes.
 *
 * Uses troika-three-text's `preloadFont` directly — @react-three/drei's <Text>
 * is a thin wrapper over troika but does not re-export the preload helper. The
 * import is lazy so troika only enters the world island's chunk, never the 2D
 * route bundles.
 */
export function preloadWorldFonts(): void {
  import('troika-three-text')
    .then(({ preloadFont }) => {
      preloadFont(
        { font: EB_GARAMOND_REGULAR, characters: WORLD_GLYPH_SET },
        () => {},
      );
      preloadFont(
        { font: EB_GARAMOND_ITALIC, characters: WORLD_GLYPH_SET },
        () => {},
      );
    })
    .catch(() => {
      // troika unavailable — fonts will load on first <Text> render instead.
      // Only consequence is a one-time glyph-atlas build on first paint.
      if (process.env.NODE_ENV === 'development') {
        console.warn('[world/fonts] troika-three-text unavailable; font preload deferred.');
      }
    });
}
