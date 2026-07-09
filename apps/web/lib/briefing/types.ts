/**
 * Shared Briefing contracts.
 *
 * Single-sourced here so the ingestion layer, the gpt-4o-mini curation worker,
 * the Drizzle schema (typed jsonb), the API routes, and the UI all agree on the
 * same shapes. Pure types only — no runtime imports — so schema.ts can import it
 * type-only without a cycle.
 */

/**
 * The fixed set of briefing sections. `general` is the catch-all so the curator
 * never has to drop an item it can't classify.
 */
export const BRIEFING_SECTIONS = [
  "top_story",
  "ai_research",
  "lab_announcements",
  "model_launches",
  "upcoming_models",
  "benchmarks",
  "semiconductors",
  "policy",
  "creators",
  "bio",
  "general",
] as const;

export type BriefingSection = (typeof BRIEFING_SECTIONS)[number];

/** Human labels for each section, used by the UI headers. */
export const BRIEFING_SECTION_LABELS: Record<BriefingSection, string> = {
  top_story: "Top Story",
  ai_research: "Frontier AI Research",
  lab_announcements: "Lab Announcements",
  model_launches: "Model Launches",
  upcoming_models: "Upcoming & Rumored Models",
  benchmarks: "Benchmarks",
  semiconductors: "Semiconductors & Hardware",
  policy: "Policy & Politics",
  creators: "What Creators Are Saying",
  bio: "Biotech & Longevity",
  general: "Also Notable",
};

/** Order the sections render in on the page. */
export const BRIEFING_SECTION_ORDER: BriefingSection[] = [
  "top_story",
  "model_launches",
  "upcoming_models",
  "ai_research",
  "lab_announcements",
  "benchmarks",
  "semiconductors",
  "policy",
  "creators",
  "bio",
  "general",
];

/**
 * A normalized item straight from an ingestion source, before curation. The
 * curator dedupes, clusters, ranks, and rewrites these into BriefingItems.
 */
export interface RawItem {
  title: string;
  /** Short excerpt / content snippet, if the source provides one. */
  snippet: string;
  url: string;
  /** Display name of the origin, e.g. "arXiv", "Hacker News", "OpenAI Blog". */
  sourceName: string;
  /** Coarse hint at where this belongs; the curator may override it. */
  sourceCategory: BriefingSection;
  /** ISO timestamp of publication, when known. */
  publishedAt: string | null;
}

/** Extra structured fields the curator may attach to a briefing item. */
export interface BriefingItemMeta {
  /** Short topical tags, e.g. ["reasoning", "open-weights"]. */
  tags?: string[];
  /** For upcoming_models: is this a confirmed release vs a rumor? */
  rumored?: boolean;
  /** For creators: the person/handle the take is attributed to. */
  creator?: string;
  /** For benchmarks: freeform score note, e.g. "DeepSWE 59% on SWE-bench". */
  benchmark?: string;
  /** Names of the distinct sources that corroborated this item. */
  sources?: string[];
}

/** One curated story, as produced by the LLM and stored in briefing_items. */
export interface CuratedItem {
  section: BriefingSection;
  title: string;
  summary: string;
  url: string | null;
  sourceName: string;
  /** 0-100 importance within the briefing; drives ranking. */
  score: number;
  meta?: BriefingItemMeta;
}

/** The full curated edition the worker persists. */
export interface CuratedEdition {
  headline: string;
  summary: string;
  items: CuratedItem[];
}
