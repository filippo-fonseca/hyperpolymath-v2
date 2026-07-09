/**
 * Briefing ingestion layer.
 *
 * Fetches raw frontier-tech news from a curated set of KEYLESS free sources
 * (RSS/Atom feeds via rss-parser plus the public Hacker News Algolia API),
 * normalizes everything to RawItem[], dedupes by URL, sorts newest-first, and
 * caps the total. Every source runs concurrently under Promise.allSettled so a
 * single hung or 404ing feed never aborts the run; each fetch is bounded by an
 * AbortController timeout. Node runtime (uses global fetch + rss-parser).
 */

import Parser from "rss-parser";
import { parse as parseHtml } from "node-html-parser";
import type { BriefingSection, RawItem } from "@/lib/briefing/types";

/** A single RSS/Atom feed and where its items coarsely belong. */
export interface FeedSource {
  /** Display name of the origin, e.g. "arXiv cs.AI". */
  sourceName: string;
  /** Absolute feed URL (RSS or Atom). */
  url: string;
  /** Default section hint; the curator may override it. */
  sourceCategory: BriefingSection;
}

/** Curated frontier-tech feeds. A few may 404; allSettled tolerates it. */
export const SOURCES: readonly FeedSource[] = [
  // Frontier AI research
  { sourceName: "arXiv cs.AI", url: "http://export.arxiv.org/rss/cs.AI", sourceCategory: "ai_research" },
  { sourceName: "arXiv cs.LG", url: "http://export.arxiv.org/rss/cs.LG", sourceCategory: "ai_research" },
  { sourceName: "arXiv cs.CL", url: "http://export.arxiv.org/rss/cs.CL", sourceCategory: "ai_research" },
  { sourceName: "BAIR Blog", url: "https://bair.berkeley.edu/blog/feed.xml", sourceCategory: "ai_research" },

  // Lab / company announcements
  { sourceName: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", sourceCategory: "lab_announcements" },
  { sourceName: "Google AI", url: "https://blog.google/technology/ai/rss/", sourceCategory: "lab_announcements" },
  { sourceName: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", sourceCategory: "lab_announcements" },
  { sourceName: "MIT News AI", url: "https://news.mit.edu/rss/topic/artificial-intelligence2", sourceCategory: "lab_announcements" },
  { sourceName: "Import AI", url: "https://importai.substack.com/feed", sourceCategory: "lab_announcements" },

  // Semiconductors & hardware
  { sourceName: "AnandTech", url: "https://www.anandtech.com/rss/", sourceCategory: "semiconductors" },
  { sourceName: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", sourceCategory: "semiconductors" },
  { sourceName: "SemiAnalysis", url: "https://semianalysis.com/feed/", sourceCategory: "semiconductors" },
  { sourceName: "IEEE Spectrum Semiconductors", url: "https://spectrum.ieee.org/feeds/topic/semiconductors.rss", sourceCategory: "semiconductors" },

  // Policy & politics
  { sourceName: "IEEE Spectrum AI Policy", url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", sourceCategory: "policy" },
  { sourceName: "Stanford HAI", url: "https://hai.stanford.edu/news/rss.xml", sourceCategory: "policy" },

  // Biotech & longevity
  { sourceName: "MIT News Biotech", url: "https://news.mit.edu/rss/topic/biotechnology", sourceCategory: "bio" },
  { sourceName: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml", sourceCategory: "bio" },
];

/** AI/tech queries fanned out against the keyless HN Algolia search API. */
const HN_QUERIES: readonly string[] = ["AI", "GPT", "LLM", "semiconductor", "Nvidia"];

const REQUEST_TIMEOUT_MS = 8_000;
const SNIPPET_MAX_CHARS = 500;
const HN_HITS_PER_QUERY = 15;
const MAX_ITEMS = 120;

/** Minimal shape of the RSS parser output we consume. */
interface ParsedFeedItem {
  title?: string;
  link?: string;
  guid?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  isoDate?: string;
  pubDate?: string;
}

const rssParser = new Parser<Record<string, unknown>, ParsedFeedItem>();

/** fetch with an AbortController deadline so a hung host can't stall the run. */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "User-Agent": "hyperpolymath-briefing", ...(init?.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML/markup to plain text and clamp to SNIPPET_MAX_CHARS. Never undefined. */
function toSnippet(raw: string | null | undefined): string {
  if (!raw) return "";
  let text: string;
  if (raw.includes("<")) {
    try {
      text = parseHtml(raw).textContent;
    } catch {
      text = raw.replace(/<[^>]*>/g, " ");
    }
  } else {
    text = raw;
  }
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_MAX_CHARS
    ? `${collapsed.slice(0, SNIPPET_MAX_CHARS - 1).trimEnd()}…`
    : collapsed;
}

/** Coerce assorted date strings to an ISO timestamp, or null when unusable. */
function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Fetch and normalize one RSS/Atom feed into RawItems. */
async function ingestFeed(source: FeedSource): Promise<RawItem[]> {
  const res = await fetchWithTimeout(source.url, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`${source.sourceName}: HTTP ${res.status}`);
  const xml = await res.text();
  const feed = await rssParser.parseString(xml);

  const items: RawItem[] = [];
  for (const item of feed.items) {
    const url = item.link ?? item.guid;
    const title = item.title?.trim();
    if (!url || !title) continue;
    items.push({
      title,
      snippet: toSnippet(item.contentSnippet ?? item.summary ?? item.content),
      url,
      sourceName: source.sourceName,
      sourceCategory: source.sourceCategory,
      publishedAt: toIso(item.isoDate ?? item.pubDate),
    });
  }
  return items;
}

/** Shape of a Hacker News Algolia search hit we rely on. */
interface HnHit {
  objectID: string;
  title?: string | null;
  story_text?: string | null;
  url?: string | null;
  created_at?: string | null;
}

interface HnResponse {
  hits?: HnHit[];
}

function isHnResponse(value: unknown): value is HnResponse {
  return typeof value === "object" && value !== null;
}

/** Coarse section hint from an HN title's keywords. */
function inferHnSection(title: string): BriefingSection {
  const t = title.toLowerCase();
  if (/(nvidia|tsmc|chip|semiconductor|gpu|silicon|wafer)/.test(t)) return "semiconductors";
  if (/(gpt|llm|claude|gemini|model|benchmark|transformer|diffusion)/.test(t)) return "ai_research";
  if (/(regulation|policy|senate|congress|eu ai act|antitrust|lawsuit)/.test(t)) return "policy";
  if (/(biotech|longevity|genom|crispr|protein|clinical)/.test(t)) return "bio";
  return "general";
}

/** Fetch one keyless HN Algolia query and normalize to RawItems. */
async function ingestHnQuery(query: string): Promise<RawItem[]> {
  const endpoint =
    "https://hn.algolia.com/api/v1/search_by_date" +
    `?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${HN_HITS_PER_QUERY}`;
  const res = await fetchWithTimeout(endpoint, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Hacker News "${query}": HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!isHnResponse(body) || !Array.isArray(body.hits)) return [];

  const items: RawItem[] = [];
  for (const hit of body.hits) {
    const title = hit.title?.trim();
    if (!title) continue;
    items.push({
      title,
      snippet: toSnippet(hit.story_text),
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      sourceName: "Hacker News",
      sourceCategory: inferHnSection(title),
      publishedAt: toIso(hit.created_at),
    });
  }
  return items;
}

/** Normalize a URL for dedup: lowercase host, drop trailing slash + hash. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let out = u.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Collapse the settled results of every source into a flat RawItem list. */
function flattenSettled(results: PromiseSettledResult<RawItem[]>[], label: string): RawItem[] {
  const out: RawItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      out.push(...r.value);
    } else {
      console.error(`[briefing/sources] ${label} source failed`, r.reason);
    }
  }
  return out;
}

/**
 * Ingest every configured source concurrently, then dedupe by normalized URL,
 * sort newest-first (unknown dates sink to the bottom), and cap at MAX_ITEMS.
 */
export async function ingestAllSources(): Promise<RawItem[]> {
  const [feedResults, hnResults] = await Promise.all([
    Promise.allSettled(SOURCES.map((s) => ingestFeed(s))),
    Promise.allSettled(HN_QUERIES.map((q) => ingestHnQuery(q))),
  ]);

  const all = [
    ...flattenSettled(feedResults, "feed"),
    ...flattenSettled(hnResults, "hn"),
  ];

  const seen = new Set<string>();
  const deduped: RawItem[] = [];
  for (const item of all) {
    const key = normalizeUrl(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bt - at;
  });

  return deduped.slice(0, MAX_ITEMS);
}
