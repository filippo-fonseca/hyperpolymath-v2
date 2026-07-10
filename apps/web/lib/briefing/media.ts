/**
 * Briefing media derivation.
 *
 * Everything here is derived purely from a story's URL at render time — no
 * extra fetches, no stored metadata, no migration. A URL tells us whether it's
 * a YouTube video, an X/Twitter post, or a plain article, and lets us build a
 * thumbnail, an embed target, and a favicon without hitting the network during
 * ingestion. Pure functions only, so both server and client components use it.
 */

export type BriefingMediaKind = "video" | "tweet" | "article";

export interface BriefingMedia {
  kind: BriefingMediaKind;
  /** Registrable host, e.g. "openai.com", for display + favicon. */
  domain: string;
  /** A 64px favicon for the source domain (keyless, no fetch). */
  faviconUrl: string;
  /** YouTube video id, when kind === "video". */
  youtubeId?: string;
  /** YouTube thumbnail URL, when kind === "video". */
  youtubeThumb?: string;
  /** YouTube privacy-friendly embed URL, when kind === "video". */
  youtubeEmbedUrl?: string;
  /** X/Twitter status id, when kind === "tweet". */
  tweetId?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Extract a YouTube video id from watch / youtu.be / shorts / embed URLs. */
function youtubeIdOf(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|embed|v)\/([^/?]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract an X/Twitter status id from a status URL. */
function tweetIdOf(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    const m = u.pathname.match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Derive display + embed media info for a briefing item URL. */
export function deriveMedia(url: string): BriefingMedia {
  const domain = hostOf(url);
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    : "";

  const youtubeId = youtubeIdOf(url);
  if (youtubeId) {
    return {
      kind: "video",
      domain: "youtube.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=youtube.com&sz=64",
      youtubeId,
      youtubeThumb: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      youtubeEmbedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
    };
  }

  const tweetId = tweetIdOf(url);
  if (tweetId) {
    return { kind: "tweet", domain: "x.com", faviconUrl, tweetId };
  }

  return { kind: "article", domain, faviconUrl };
}
