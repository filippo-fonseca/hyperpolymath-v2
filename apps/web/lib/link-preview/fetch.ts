// Issue #221 — server-side link-preview fetcher. Resolves Open Graph / Twitter
// card metadata, favicon, and provider-specific extras (YouTube oEmbed, X/Twitter
// oEmbed) for a URL. Pure I/O + parsing; persistence lives in the query helper.
// Always resolves (never throws): on any failure it returns status 'error' so the
// caller degrades to a plain link.
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { parse } from "node-html-parser";
import {
  classifyMediaType,
  faviconFor,
  isTwitterStatusUrl,
  safeParseUrl,
  siteNameFrom,
  youtubeVideoId,
} from "./classify";
import type { LinkPreviewProviderData, LinkPreviewResult } from "./types";

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1_500_000; // don't parse enormous pages
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "Mozilla/5.0 (compatible; HyperpolymathLinkPreview/1.0; +https://hyperpolymath.app)";

function truncate(s: string | null | undefined, n = 500): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || null;
}

// MAJOR-1 — SSRF hardening. Reject any address in a private / loopback /
// link-local / CGNAT / ULA range before we let Node's fetch resolve it. Also
// reject the literal "localhost" hostname up front (some resolvers hand back
// external IPs for "localhost" on hostile networks; belt-and-braces).
function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true; // malformed → refuse
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const normalized = addr.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback + unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe80::")) return true; // link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 ULA
  if (normalized.startsWith("ff")) return true; // multicast
  // IPv4-mapped: ::ffff:127.0.0.1
  const mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(addr: string, family: number): boolean {
  return family === 6 ? isPrivateIPv6(addr) : isPrivateIPv4(addr);
}

/**
 * Resolve the hostname of `url` and refuse if any resolved address is in a
 * private range, or if the hostname is a literal `localhost` / loopback IP.
 * Called once before the initial fetch and again on every redirect hop.
 *
 * Note: this is a best-effort mitigation. It does NOT close a DNS-rebinding
 * race where the resolver returns a public address here and a private one
 * on the actual fetch — the runtime would need a custom `undici` connector
 * that pins the resolved IP for that. Combined with `redirect: "manual"`
 * and the hop cap, the attack surface for the current single-user threat
 * model is acceptable.
 */
async function assertSafeHost(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) throw new Error("link-preview: empty hostname");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("link-preview: refused to fetch localhost");
  }
  // If the URL already carries an IP literal, check it directly and skip DNS.
  const family = isIP(hostname);
  if (family !== 0) {
    if (isPrivateAddress(hostname, family)) {
      throw new Error(`link-preview: refused private address ${hostname}`);
    }
    return;
  }
  const results = await dns.lookup(hostname, { all: true });
  if (results.length === 0) {
    throw new Error(`link-preview: DNS resolution failed for ${hostname}`);
  }
  for (const { address, family: fam } of results) {
    if (isPrivateAddress(address, fam)) {
      throw new Error(
        `link-preview: refused ${hostname} → ${address} (private/link-local)`,
      );
    }
  }
}

/**
 * Fetch `url` with a hard timeout, following up to MAX_REDIRECTS hops
 * manually so each redirect target is re-validated by assertSafeHost().
 * `redirect: "manual"` prevents `fetch` from silently pivoting to a
 * private-IP target that was reached via a public 302.
 */
async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = safeParseUrl(current);
      if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        throw new Error("link-preview: unsupported redirect scheme");
      }
      await assertSafeHost(parsed);
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept },
      });
      // Non-redirect status: return it.
      if (res.status < 300 || res.status >= 400) {
        return res;
      }
      const location = res.headers.get("location");
      if (!location) return res; // 3xx with no Location — return as-is
      // Resolve relative Location against the current URL, then loop.
      current = new URL(location, current).href;
      // Consume the redirect response body so the connection can be reused.
      try {
        await res.body?.cancel();
      } catch {
        // ignore
      }
    }
    throw new Error(`link-preview: exceeded ${MAX_REDIRECTS} redirects`);
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

/**
 * MAJOR-2 — stream the response body up to MAX_HTML_BYTES, aborting the
 * reader as soon as we exceed the cap. `res.arrayBuffer()` buffered the
 * ENTIRE response before slicing, which is a memory-DoS gadget on a fast
 * link within the 6s timeout. This reads the reader chunk-by-chunk and
 * bails as soon as we have enough bytes.
 */
async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback: some transports may not expose a reader. Cap via arrayBuffer
    // is imperfect but preserves behavior for edge cases.
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.slice(0, cap);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = cap - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.slice(0, remaining));
        total += remaining;
        // Abort the underlying stream — we have what we need.
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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

async function fetchGeneric(url: string): Promise<LinkPreviewResult> {
  const res = await fetchWithTimeout(url, "text/html,application/xhtml+xml");
  if (!res.ok) return errorResult(url, `HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    // Non-HTML (image, pdf, etc.): a bare favicon card is the best we can do.
    // Drain the body so the connection can be reused; we don't need the bytes.
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
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
  const bytes = await readCapped(res, MAX_HTML_BYTES);
  const html = new TextDecoder("utf-8").decode(bytes);
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
