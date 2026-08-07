/**
 * Covers and banners — one encoding, two surfaces.
 *
 * Wiki pages stored a raw image URL in `pages.cover_image_url`; projects stored
 * a `solid:`/`gradient:` CSS string in `projects.banner_url`. Each surface
 * therefore had exactly the half the other was missing: pages could not pick a
 * colour, projects could not pick a photo.
 *
 * Both columns now speak the same small language, and neither needed a
 * migration because every existing value already parses:
 *
 *   "solid:hsl(30 20% 82%)"                → a flat colour
 *   "gradient:linear-gradient(135deg, …)"  → a gradient
 *   "https://images.unsplash.com/…"        → an image
 *
 * Anything unrecognized is treated as an image URL, which is what the old page
 * rows are.
 */

export type Cover = { kind: "color"; css: string } | { kind: "image"; url: string } | null;

export function parseCover(value: string | null | undefined): Cover {
  if (!value) return null;
  if (value.startsWith("solid:")) return { kind: "color", css: value.slice(6) };
  if (value.startsWith("gradient:")) return { kind: "color", css: value.slice(9) };
  return { kind: "image", url: value };
}

/** True when the stored value paints a colour rather than fetching an image. */
export function isColorCover(value: string | null | undefined): boolean {
  return parseCover(value)?.kind === "color";
}

export type CoverPreset = {
  name: string;
  /** The stored value, prefix included. */
  value: string;
  kind: "solid" | "gradient";
};

/**
 * The preset palette, shared by page covers and project banners so a project
 * and a page painted "Verdigris" are the same green.
 *
 * Muted earth tones and fresco-inspired gradients, per the original project
 * banner spec — the aesthetic these were designed against has not changed, and
 * pages inherit it rather than getting a second, competing set.
 */
export const COVER_PRESETS: CoverPreset[] = [
  { name: "Parchment", kind: "solid", value: "solid:hsl(42, 18%, 97%)" },
  { name: "Warm Linen", kind: "solid", value: "solid:hsl(30, 20%, 82%)" },
  { name: "Old Gold", kind: "solid", value: "solid:hsl(38, 35%, 72%)" },
  { name: "Terra Cotta", kind: "solid", value: "solid:hsl(25, 40%, 60%)" },
  { name: "Slate Blue", kind: "solid", value: "solid:hsl(200, 20%, 65%)" },
  { name: "Sage", kind: "solid", value: "solid:hsl(155, 18%, 60%)" },
  { name: "Lavender Grey", kind: "solid", value: "solid:hsl(300, 10%, 65%)" },
  { name: "Sepia Dark", kind: "solid", value: "solid:hsl(30, 8%, 35%)" },
  {
    name: "Fresco Amber",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(42, 60%, 88%) 0%, hsl(25, 50%, 78%) 100%)",
  },
  {
    name: "Venetian Blue",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(195, 35%, 80%) 0%, hsl(215, 30%, 70%) 100%)",
  },
  {
    name: "Verdigris",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(155, 25%, 78%) 0%, hsl(180, 20%, 68%) 100%)",
  },
  {
    name: "Byzantine Purple",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(280, 20%, 80%) 0%, hsl(310, 15%, 72%) 100%)",
  },
  {
    name: "Sienna Gold",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(30, 40%, 85%) 0%, hsl(50, 35%, 78%) 100%)",
  },
  {
    name: "Pompeian Rose",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(0, 25%, 82%) 0%, hsl(20, 30%, 74%) 100%)",
  },
  {
    name: "Ash Stone",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(220, 15%, 75%) 0%, hsl(240, 12%, 68%) 100%)",
  },
  {
    name: "Paper Sage",
    kind: "gradient",
    value: "gradient:linear-gradient(135deg, hsl(42, 18%, 92%) 0%, hsl(155, 12%, 85%) 100%)",
  },
];

/** CSS `background` for a stored value; falls back to the parchment default. */
export function coverBackground(value: string | null | undefined): string {
  const cover = parseCover(value);
  if (cover?.kind === "color") return cover.css;
  return "hsl(42, 18%, 97%)";
}
