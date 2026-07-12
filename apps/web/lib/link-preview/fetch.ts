// Issue #221 — server-side link-preview fetcher. Resolves Open Graph / Twitter
// card metadata, favicon, and provider-specific extras (YouTube oEmbed, X/Twitter
// oEmbed) for a URL. Pure I/O + parsing; persistence lives in the query helper.
// Always resolves (never throws): on any failure it returns status 'error' so the
// caller degrades to a plain link.
import { parse } from "node-html-parser";
import {
  classifyMediaType,
  faviconFor,
  isTwitterStatusUrl,
  safeParseUrl,
  siteNameFrom,
  youtubeVideoId,
} from "./classify";
import { assertHostAllowed } from "./ssrf";
import type { LinkPreviewProviderData, LinkPreviewResult } from "./types";

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1_500_000; // don't parse enormous pages
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT =
  "Mozilla/5.0 (compatible; HyperpolymathLinkPreview/1.0; +https://hyperpolymath.app)";

function truncate(s: string | null | undefined, n = 500): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || null;
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  // One controller across all hops so the total time budget still caps at 6s.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = url;
    // Manual redirect handling so we can validate EVERY hop's host (the SSRF
    // choke point). Guards the initial URL and each redirect Location target.
    for (let remaining = MAX_REDIRECTS; ; remaining--) {
      const parsed = safeParseUrl(currentUrl);
      if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        throw new Error("Unsupported redirect target");
      }
      await assertHostAllowed(parsed);
      const res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept },
      });
      const location = res.headers.get("location");
      if (REDIRECT_STATUSES.has(res.status) && location) {
        if (remaining <= 0) throw new Error("Too many redirects");
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }
      return res;
    }
  } finally {
    clearTimeout(timer);
  }
}

function errorResult(url: string, message: string): LinkPreviewResult {
  return {
    url,
    status: "error",
    mediaType: classifyMediaType(url),
    title: null,
    description: null,
    imageUrl: null,
    faviconUrl: faviconFor(url),
    siteName: siteNameFrom(url),
    providerData: null,
    error: truncate(message, 300),
  };
}

/** Pull an og:/twitter:/name meta value or <title> from parsed HTML. */
function extractMeta(html: string): {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
} {
  const root = parse(html, { comment: false });
  const metaVal = (keys: string[]): string | null => {
    for (const key of keys) {
      const el =
        root.querySelector(`meta[property="${key}"]`) || root.querySelector(`meta[name="${key}"]`);
      const content = el?.getAttribute("content");
      if (content?.trim()) return content.trim();
    }
    return null;
  };
  const docTitle = root.querySelector("title")?.text?.trim() || null;
  return {
    title: metaVal(["og:title", "twitter:title"]) ?? docTitle,
    description: metaVal(["og:description", "twitter:description", "description"]),
    imageUrl: metaVal(["og:image", "og:image:url", "twitter:image", "twitter:image:src"]),
    siteName: metaVal(["og:site_name"]),
  };
}

interface OEmbed {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  html?: string;
  provider_name?: string;
}

async function fetchOEmbed(endpoint: string): Promise<OEmbed | null> {
  try {
    const res = await fetchWithTimeout(endpoint, "application/json");
    if (!res.ok) return null;
    return (await res.json()) as OEmbed;
  } catch {
    return null;
  }
}

async function fetchYouTube(url: string, videoId: string): Promise<LinkPreviewResult> {
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const oembed = await fetchOEmbed(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  );
  const provider: LinkPreviewProviderData = {
    youtubeVideoId: videoId,
    youtubeThumbnailUrl: oembed?.thumbnail_url || thumb,
    youtubeChannel: oembed?.author_name,
    oembedProvider: "YouTube",
  };
  return {
    url,
    status: "ok",
    mediaType: "youtube",
    title: truncate(oembed?.title) ?? "YouTube video",
    description: oembed?.author_name ? `by ${oembed.author_name}` : null,
    imageUrl: oembed?.thumbnail_url || thumb,
    faviconUrl: faviconFor(url),
    siteName: "youtube.com",
    providerData: provider,
    error: null,
  };
}

// Strip tags from the oEmbed blockquote html to recover the tweet text.
function tweetTextFromHtml(html: string | undefined): string | null {
  if (!html) return null;
  const root = parse(html, { comment: false });
  const p = root.querySelector("blockquote p") || root.querySelector("p");
  const text = (p?.text || root.text || "").replace(/\s+/g, " ").trim();
  return truncate(text, 500);
}

async function fetchTwitter(url: string): Promise<LinkPreviewResult> {
  const oembed = await fetchOEmbed(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1&dnt=true`
  );
  if (!oembed) {
    // Degrade: still a recognizable X card even without the tweet body.
    return {
      url,
      status: "ok",
      mediaType: "twitter",
      title: "Post on X",
      description: null,
      imageUrl: null,
      faviconUrl: faviconFor(url),
      siteName: "x.com",
      providerData: null,
      error: null,
    };
  }
  const tweetText = tweetTextFromHtml(oembed.html);
  const handle = oembed.author_url?.split("/").filter(Boolean).pop() ?? undefined;
  const provider: LinkPreviewProviderData = {
    tweetText: tweetText ?? undefined,
    tweetAuthor: oembed.author_name,
    tweetAuthorHandle: handle,
    oembedProvider: oembed.provider_name ?? "Twitter",
  };
  return {
    url,
    status: "ok",
    mediaType: "twitter",
    title: oembed.author_name ? `${oembed.author_name} on X` : "Post on X",
    description: tweetText,
    imageUrl: null,
    faviconUrl: faviconFor(url),
    siteName: "x.com",
    providerData: provider,
    error: null,
  };
}

/**
 * Read a response body as text, capping at MAX_HTML_BYTES via a streamed reader so
 * a hostile huge response never buffers fully into memory. The download is cancelled
 * once the byte budget is reached. Decodes only up to MAX_HTML_BYTES (matches the
 * previous slice-then-decode semantics).
 */
async function readCappedText(res: Response): Promise<string> {
  if (!res.body) {
    // Bodyless response (rare): keep prior behavior.
    return (await res.text()).slice(0, MAX_HTML_BYTES);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = MAX_HTML_BYTES - received;
    if (value.length >= remaining) {
      chunks.push(value.subarray(0, remaining));
      received += remaining;
      await reader.cancel(); // stop the download once the cap is hit
      break;
    }
    chunks.push(value);
    received += value.length;
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(merged);
}

async function fetchGeneric(url: string): Promise<LinkPreviewResult> {
  const res = await fetchWithTimeout(url, "text/html,application/xhtml+xml");
  if (!res.ok) return errorResult(url, `HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    // Non-HTML (image, pdf, etc.): a bare favicon card is the best we can do.
    return {
      url,
      status: "ok",
      mediaType: "generic",
      title: null,
      description: null,
      imageUrl: null,
      faviconUrl: faviconFor(url),
      siteName: siteNameFrom(url),
      providerData: null,
      error: null,
    };
  }
  const html = await readCappedText(res);
  const meta = extractMeta(html);
  // Resolve a relative og:image against the final URL.
  let imageUrl = meta.imageUrl;
  if (imageUrl) {
    const abs = safeParseUrl(imageUrl) ?? safeParseUrl(new URL(imageUrl, url).href);
    imageUrl = abs ? abs.href : null;
  }
  return {
    url,
    status: "ok",
    mediaType: "generic",
    title: truncate(meta.title, 300),
    description: truncate(meta.description, 500),
    imageUrl,
    faviconUrl: faviconFor(url),
    siteName: meta.siteName ?? siteNameFrom(url),
    providerData: null,
    error: null,
  };
}

/** Fetch and normalize link-preview metadata for a URL. Never throws. */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewResult> {
  const parsed = safeParseUrl(url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return errorResult(url, "Unsupported or invalid URL");
  }
  try {
    const ytId = youtubeVideoId(url);
    if (ytId) return await fetchYouTube(url, ytId);
    if (isTwitterStatusUrl(url)) return await fetchTwitter(url);
    return await fetchGeneric(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return errorResult(url, message);
  }
}
