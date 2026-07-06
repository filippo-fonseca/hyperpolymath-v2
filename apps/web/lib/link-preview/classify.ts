// Issue #221 — pure URL classification helpers (no I/O, unit-testable).
import type { LinkPreviewMediaType } from "./types";

/** Parse a URL, returning null instead of throwing on malformed input. */
export function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hostname(u: URL): string {
  return u.hostname.replace(/^www\./, "").toLowerCase();
}

/** Extract a YouTube video id from watch, youtu.be, shorts, or embed URLs. */
export function youtubeVideoId(raw: string): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const host = hostname(u);
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id || null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
    if (m) return m[1];
  }
  return null;
}

/** True for x.com / twitter.com status URLs (a single tweet). */
export function isTwitterStatusUrl(raw: string): boolean {
  const u = safeParseUrl(raw);
  if (!u) return false;
  const host = hostname(u);
  const isTwitterHost =
    host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com";
  return isTwitterHost && /\/status(?:es)?\/\d+/.test(u.pathname);
}

export function classifyMediaType(raw: string): LinkPreviewMediaType {
  if (youtubeVideoId(raw)) return "youtube";
  if (isTwitterStatusUrl(raw)) return "twitter";
  return "generic";
}

/** Best-effort favicon URL from a page origin (Google's S2 service as fallback). */
export function faviconFor(raw: string): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
}

/** Human-readable site label from the hostname (e.g. "youtube.com"). */
export function siteNameFrom(raw: string): string | null {
  const u = safeParseUrl(raw);
  return u ? hostname(u) : null;
}
