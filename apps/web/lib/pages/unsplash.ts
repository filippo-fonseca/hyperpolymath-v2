/**
 * Shared Unsplash types for the page cover picker (issue #28).
 *
 * Single-sourced here so both the server proxy route
 * (app/api/integrations/unsplash/search/route.ts) and the client picker
 * (components/pages/CoverImagePicker.tsx) agree on the result shape without the
 * client importing from a route module.
 */

/** Trimmed photo shape returned by the Unsplash search proxy to the picker. */
export interface UnsplashPhoto {
  id: string;
  /** Display URL for the picker grid thumbnail. */
  thumbUrl: string;
  /** URL stored as the page cover (regular size — good banner resolution). */
  fullUrl: string;
  /** Photographer display name. */
  authorName: string;
  /** Photographer's Unsplash profile URL. */
  authorUrl: string;
  /** Alt text for the <img>. */
  alt: string;
  /** Unsplash download-tracking endpoint to ping on selection (API guideline). */
  downloadLocation: string;
}
