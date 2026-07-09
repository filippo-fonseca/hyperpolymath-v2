import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import { briefingSources } from "./sources";
import type { BriefingCategory, BriefingItem, BriefingSource } from "./types";

const ARXIV_BASE_URL = "https://export.arxiv.org/api/query";
const HN_BASE_URL = "https://hn.algolia.com/api/v1/search_by_date";
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ITEMS_PER_SOURCE = 25;

const importantTerms = [
  "gpt",
  "claude",
  "gemini",
  "grok",
  "llama",
  "mistral",
  "deepseek",
  "qwen",
  "frontier",
  "reasoning",
  "agent",
  "agents",
  "swe-bench",
  "swebench",
  "deepswe",
  "deep swe",
  "livecodebench",
  "benchmark",
  "eval",
  "leaderboard",
  "launch",
  "release",
  "preview",
  "rumor",
  "leak",
  "policy",
  "regulation",
  "export control",
  "chip",
  "semiconductor",
  "gpu",
  "h100",
  "h200",
  "b200",
  "blackwell",
  "tsmc",
  "nvidia",
  "bio",
  "biology",
  "protein",
  "drug discovery",
];

const categoryHints: Record<BriefingCategory, string[]> = {
  frontier_ai: ["frontier", "gpt", "claude", "gemini", "grok", "llama", "deepseek", "qwen"],
  research: ["arxiv", "paper", "research", "training", "inference", "reasoning"],
  policy: ["policy", "regulation", "government", "executive order", "nist", "law", "senate"],
  labs: ["openai", "anthropic", "deepmind", "google", "meta", "microsoft", "xai", "mistral"],
  semiconductors: ["chip", "gpu", "semiconductor", "nvidia", "tsmc", "blackwell", "hbm"],
  benchmarks: ["benchmark", "leaderboard", "swe-bench", "deepswe", "livecodebench", "eval"],
  bio: ["bio", "biology", "protein", "drug", "genomics", "medical", "health"],
  creators: ["karpathy", "theo", "t3.gg", "dwarkesh", "swyx", "noam brown"],
  markets: ["market", "stock", "earnings", "capex", "supply chain"],
};

const hnSchema = z.object({
  hits: z.array(
    z.object({
      objectID: z.string(),
      title: z.string().nullable().optional(),
      story_title: z.string().nullable().optional(),
      url: z.string().nullable().optional(),
      story_url: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
      points: z.number().nullable().optional(),
      num_comments: z.number().nullable().optional(),
      author: z.string().nullable().optional(),
    })
  ),
});

export interface BriefingFetchResult {
  items: BriefingItem[];
  failedSources: { source: string; error: string }[];
}

export async function fetchBriefingItems(): Promise<BriefingFetchResult> {
  const settled = await Promise.allSettled(briefingSources.map((source) => fetchSource(source)));
  const failedSources: { source: string; error: string }[] = [];
  const items: BriefingItem[] = [];

  settled.forEach((result, index) => {
    const source = briefingSources[index];
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      failedSources.push({
        source: source.name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return {
    failedSources,
    items: dedupeItems(items)
      .sort((a, b) => b.score - a.score || dateMs(b.publishedAt) - dateMs(a.publishedAt))
      .slice(0, 120),
  };
}

async function fetchSource(source: BriefingSource): Promise<BriefingItem[]> {
  if (source.kind === "arxiv") return fetchArxiv(source);
  if (source.kind === "hn") return fetchHn(source);
  return fetchFeed(source);
}

async function fetchFeed(source: BriefingSource): Promise<BriefingItem[]> {
  const xml = await fetchText(source.url);
  const entries =
    source.kind === "atom" || xml.includes("<feed") ? parseAtomEntries(xml) : parseRssItems(xml);
  return entries
    .map((entry) => normalizeFeedEntry(source, entry))
    .filter((item): item is BriefingItem => item !== null)
    .slice(0, MAX_ITEMS_PER_SOURCE);
}

async function fetchArxiv(source: BriefingSource): Promise<BriefingItem[]> {
  const xml = await fetchText(`${ARXIV_BASE_URL}?${source.url}`);
  return parseAtomEntries(xml)
    .map((entry) => normalizeFeedEntry(source, entry))
    .filter((item): item is BriefingItem => item !== null)
    .slice(0, MAX_ITEMS_PER_SOURCE);
}

async function fetchHn(source: BriefingSource): Promise<BriefingItem[]> {
  const json = await fetchJson(`${HN_BASE_URL}?${source.url}&hitsPerPage=25`);
  const parsed = hnSchema.parse(json);
  return parsed.hits
    .map((hit) => {
      const title = hit.title ?? hit.story_title ?? "";
      const url =
        hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const summary = [
        hit.author ? `HN by ${hit.author}` : null,
        hit.points != null ? `${hit.points} points` : null,
        hit.num_comments != null ? `${hit.num_comments} comments` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return buildItem({
        title,
        summary,
        url,
        source,
        publishedAt: hit.created_at ?? null,
        nativeScore: (hit.points ?? 0) / 40 + (hit.num_comments ?? 0) / 80,
      });
    })
    .filter((item): item is BriefingItem => item !== null)
    .slice(0, MAX_ITEMS_PER_SOURCE);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Hyperpolymath Briefing/1.0" },
    next: { revalidate: 60 * 60 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "user-agent": "Hyperpolymath Briefing/1.0" },
    next: { revalidate: 60 * 60 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface RawEntry {
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
}

function parseRssItems(xml: string): RawEntry[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const block = match[0];
    return {
      title: getTag(block, "title"),
      summary: getTag(block, "description") || getTag(block, "content:encoded"),
      url: getTag(block, "link") || getTag(block, "guid"),
      publishedAt: getTag(block, "pubDate") || getTag(block, "dc:date") || null,
    };
  });
}

function parseAtomEntries(xml: string): RawEntry[] {
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => {
    const block = match[0];
    return {
      title: getTag(block, "title"),
      summary: getTag(block, "summary") || getTag(block, "content"),
      url: getAtomLink(block) || getTag(block, "id"),
      publishedAt: getTag(block, "published") || getTag(block, "updated") || null,
    };
  });
}

function normalizeFeedEntry(source: BriefingSource, entry: RawEntry): BriefingItem | null {
  return buildItem({
    title: entry.title,
    summary: entry.summary,
    url: entry.url,
    source,
    publishedAt: entry.publishedAt,
  });
}

function buildItem(input: {
  title: string;
  summary: string;
  url: string;
  source: BriefingSource;
  publishedAt: string | null;
  nativeScore?: number;
}): BriefingItem | null {
  const title = cleanText(input.title);
  const url = decodeEntities(input.url).trim();
  if (!title || !url) return null;

  const publishedAt = normalizeDate(input.publishedAt);
  const text = `${title} ${cleanText(input.summary)}`;
  const tags = inferTags(text, input.source.category);
  const recent = publishedAt
    ? Math.max(0, 1 - (Date.now() - dateMs(publishedAt)) / LOOKBACK_MS)
    : 0.25;
  const relevance = tags.length / 5;
  const score = Number(
    (input.source.weight * 2 + recent * 2 + relevance + (input.nativeScore ?? 0)).toFixed(3)
  );

  return {
    id: hash(`${input.source.id}:${url}:${title}`),
    title,
    summary: cleanText(input.summary).slice(0, 420),
    url,
    source: input.source.name,
    sourceId: input.source.id,
    category: input.source.category,
    publishedAt,
    score,
    tags,
  };
}

function inferTags(text: string, category: BriefingCategory): string[] {
  const hay = text.toLowerCase();
  const tags = new Set<string>();
  for (const term of importantTerms) {
    if (hay.includes(term)) tags.add(term);
  }
  for (const term of categoryHints[category]) {
    if (hay.includes(term)) tags.add(term);
  }
  tags.add(category.replace("_", " "));
  return [...tags].slice(0, 8);
}

function dedupeItems(items: BriefingItem[]): BriefingItem[] {
  const seen = new Map<string, BriefingItem>();
  for (const item of items) {
    const key = canonicalKey(item);
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) seen.set(key, item);
  }
  return [...seen.values()];
}

function canonicalKey(item: BriefingItem): string {
  try {
    const url = new URL(item.url);
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
}

function getTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeEntities(stripCdata(match[1])) : "";
}

function getAtomLink(block: string): string {
  const alternate = block.match(
    /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i
  );
  if (alternate?.[1]) return alternate[1];
  const any = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return any?.[1] ?? "";
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function cleanText(text: string): string {
  return decodeEntities(stripHtml(stripCdata(text)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateMs(value: string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function hash(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}
