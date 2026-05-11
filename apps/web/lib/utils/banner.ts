/**
 * Banner is stored as one of:
 *   "solid:hsl(30, 20%, 82%)"
 *   "gradient:linear-gradient(135deg, hsl(...) 0%, hsl(...) 100%)"
 *   null → default Parchment
 *
 * Returns the CSS background value to pass to style.background.
 * Future image upload (Phase 6) can add "image:<url>" without breaking existing rows.
 */
export function parseBanner(bannerUrl: string | null | undefined): string {
  if (!bannerUrl) return "hsl(42, 18%, 97%)"; // Parchment default
  if (bannerUrl.startsWith("solid:")) return bannerUrl.slice(6);
  if (bannerUrl.startsWith("gradient:")) return bannerUrl.slice(9);
  return bannerUrl; // raw CSS fallback
}
