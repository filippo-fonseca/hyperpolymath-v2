export type LinkPreviewMediaType = "generic" | "youtube" | "twitter";

const BLOCKED_HOSTS = [
  "google.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
] as const;

export function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hostname(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

function youtubeVideoId(raw: string): string | null {
  const url = safeParseUrl(raw);
  if (!url) return null;
  const host = hostname(url);
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    return url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ?? null;
  }
  return null;
}

export function classifyLinkEmbed(raw: string): {
  mediaType: LinkPreviewMediaType;
  youtubeId: string | null;
} {
  const youtubeId = youtubeVideoId(raw);
  if (youtubeId) return { mediaType: "youtube", youtubeId };
  return {
    mediaType: twitterStatusId(raw) ? "twitter" : "generic",
    youtubeId: null,
  };
}

export function linkDomain(raw: string): string {
  const parsed = safeParseUrl(raw);
  return parsed?.hostname.replace(/^www\./, "") ?? raw;
}

export function normalizeBrowserUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = safeParseUrl(withScheme);
  return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")
    ? parsed.href
    : null;
}

export function isKnownFrameBlocker(value: string): boolean {
  const host = safeParseUrl(value)?.hostname.replace(/^www\./, "").toLowerCase();
  if (!host) return false;
  return BLOCKED_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

export function twitterStatusId(value: string): string | null {
  return safeParseUrl(value)?.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null;
}
