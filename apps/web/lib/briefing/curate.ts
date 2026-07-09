/**
 * curate.ts — the Briefing curation worker.
 *
 * Takes raw ingested news items and runs ONE gpt-4o-mini call (JSON mode) that
 * clusters/dedupes related stories, ranks and summarizes them, assigns each to a
 * BriefingSection, scores importance, and picks a single top story — producing a
 * structured CuratedEdition for a technical reader (Filippo) who wants a daily
 * frontier-tech intelligence digest (AI research, lab announcements, model
 * launches, an upcoming/rumored watchlist, benchmarks, semiconductors, policy,
 * what top creators are saying, and biotech).
 *
 * All model output is Zod-validated defensively: bad sections fall back to
 * "general", scores are clamped 0-100, malformed items are dropped, and we always
 * return a well-formed CuratedEdition even if the model returns partial junk.
 *
 * Node runtime. If OPENAI_API_KEY is not configured, this throws so the caller
 * can handle it.
 */

import { z } from "zod";
import { getOwnerOpenAIClient, OPENAI_MINI_MODEL } from "@/lib/openai/client";
import {
  BRIEFING_SECTIONS,
  type BriefingSection,
  type CuratedEdition,
  type CuratedItem,
  type RawItem,
} from "@/lib/briefing/types";

/** Cap on how many raw items we feed the model, newest-first bias. */
const MAX_ITEMS_SENT = 80;
/** Snippet truncation to keep the prompt bounded. */
const MAX_SNIPPET_CHARS = 400;

const SECTION_SET = new Set<string>(BRIEFING_SECTIONS);

/** Coerce any string into a valid BriefingSection, defaulting to "general". */
function coerceSection(value: unknown): BriefingSection {
  if (typeof value === "string" && SECTION_SET.has(value)) {
    return value as BriefingSection;
  }
  return "general";
}

/** Clamp a numeric score into the 0-100 range; non-numbers become 0. */
function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Zod schema for the model's per-item output. Loose on purpose: we accept junk
// then coerce/clamp it into a valid CuratedItem, or drop it if unusable.
const rawCuratedItemSchema = z.object({
  section: z.unknown().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().nullish(),
  sourceName: z.string().optional(),
  score: z.unknown().optional(),
  meta: z
    .object({
      tags: z.array(z.string()).optional(),
      rumored: z.boolean().optional(),
      creator: z.string().optional(),
      benchmark: z.string().optional(),
      sources: z.array(z.string()).optional(),
    })
    .optional(),
});

const rawEditionSchema = z.object({
  headline: z.string().optional(),
  summary: z.string().optional(),
  top_story: rawCuratedItemSchema.optional(),
  items: z.array(rawCuratedItemSchema).optional(),
});

const SYSTEM_PROMPT = [
  "You are a frontier-tech intelligence analyst producing a daily briefing for a sharp technical reader named Filippo.",
  "He wants to stay on top of: frontier AI research, AI lab announcements, MODEL LAUNCHES (e.g. \"Grok 4.5 launched\", \"GPT-5.6 released\"), an UPCOMING/RUMORED models watchlist, benchmarks (DeepSWE, SWE-bench, etc.), semiconductors and hardware, policy/politics affecting AI, what top creators (Theo/t3.gg, Karpathy, etc.) are discussing, and biotech/longevity.",
  "",
  "Your job:",
  "1. DEDUPE and CLUSTER related items into ONE story each. When multiple sources cover the same event, merge them and list the corroborating sources in meta.sources.",
  "2. For each story write a concise, punchy 2-3 sentence summary aimed at a technical reader — no fluff, no marketing tone.",
  "3. Assign each story to exactly ONE section. Valid sections are: " +
    BRIEFING_SECTIONS.join(", ") +
    ". Use \"general\" only when nothing else fits.",
  "4. Score each story's importance from 0 to 100 (higher = more important to a frontier-tech reader). Reserve 90+ for genuinely major news.",
  "5. Pick exactly ONE clear top_story: the single most important story of the day. It should also appear as its own item.",
  "6. Populate meta where relevant: for upcoming_models set meta.rumored (true if speculative/leaked, false if officially confirmed but not yet released); for creators set meta.creator to the person/handle; for benchmarks set meta.benchmark to a short score note (e.g. \"DeepSWE 59% on SWE-bench\"); add short meta.tags where useful.",
  "7. Write an overall one-line `headline` and a 2-3 sentence editor's-note `summary` for the whole edition.",
  "",
  "Respond with ONLY a JSON object of this exact shape:",
  "{",
  '  "headline": string,',
  '  "summary": string,',
  '  "top_story": { "section": string, "title": string, "summary": string, "url": string|null, "sourceName": string, "score": number, "meta"?: {...} },',
  '  "items": [ { "section": string, "title": string, "summary": string, "url": string|null, "sourceName": string, "score": number, "meta"?: {...} }, ... ]',
  "}",
  "Every raw item worth keeping should appear in items. Do not invent stories that are not grounded in the provided sources.",
].join("\n");

/** Compact one raw item for the prompt, truncating the snippet. */
function compactRaw(item: RawItem): Record<string, unknown> {
  const snippet =
    item.snippet.length > MAX_SNIPPET_CHARS
      ? `${item.snippet.slice(0, MAX_SNIPPET_CHARS)}…`
      : item.snippet;
  return {
    title: item.title,
    snippet,
    sourceName: item.sourceName,
    sourceCategory: item.sourceCategory,
    url: item.url,
    publishedAt: item.publishedAt,
  };
}

/** Build a valid CuratedItem from loosely-parsed model output, or null to drop. */
function toCuratedItem(raw: z.infer<typeof rawCuratedItemSchema>): CuratedItem | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  // A story with no title or no summary is not useful; drop it.
  if (!title || !summary) return null;

  const url =
    typeof raw.url === "string" && raw.url.trim().length > 0 ? raw.url.trim() : null;
  const sourceName =
    typeof raw.sourceName === "string" && raw.sourceName.trim().length > 0
      ? raw.sourceName.trim()
      : "Unknown";

  const item: CuratedItem = {
    section: coerceSection(raw.section),
    title,
    summary,
    url,
    sourceName,
    score: clampScore(raw.score),
  };

  if (raw.meta) {
    const meta: NonNullable<CuratedItem["meta"]> = {};
    if (raw.meta.tags?.length) meta.tags = raw.meta.tags;
    if (typeof raw.meta.rumored === "boolean") meta.rumored = raw.meta.rumored;
    if (raw.meta.creator) meta.creator = raw.meta.creator;
    if (raw.meta.benchmark) meta.benchmark = raw.meta.benchmark;
    if (raw.meta.sources?.length) meta.sources = raw.meta.sources;
    if (Object.keys(meta).length > 0) item.meta = meta;
  }

  return item;
}

/**
 * Curate a batch of raw ingested items into a structured CuratedEdition via one
 * gpt-4o-mini call. Throws if no OpenAI key is configured; otherwise always
 * returns a well-formed edition (possibly empty) even on degraded model output.
 */
export async function curateBriefing(rawItems: RawItem[]): Promise<CuratedEdition> {
  const client = getOwnerOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const empty: CuratedEdition = {
    headline: "No stories today",
    summary: "No items were available to curate for this edition.",
    items: [],
  };

  if (rawItems.length === 0) return empty;

  // Bias toward the most recent items, then cap the count we send.
  const sorted = [...rawItems].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  const payload = sorted.slice(0, MAX_ITEMS_SENT).map(compactRaw);

  let content: string;
  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MINI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here are today's raw items as JSON. Curate them into the briefing edition described above.\n\n${JSON.stringify(
            payload,
          )}`,
        },
      ],
    });
    content = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw new Error(
      `curateBriefing: gpt-4o-mini call failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Parse the JSON text; on any failure, degrade to a safe empty edition rather
  // than throwing, so a single bad response never kills the pipeline.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    console.error("[curate] model returned non-JSON output; returning empty edition");
    return empty;
  }

  const result = rawEditionSchema.safeParse(parsedJson);
  if (!result.success) {
    console.error("[curate] model output failed schema validation; returning empty edition");
    return empty;
  }
  const data = result.data;

  const items: CuratedItem[] = [];
  const seenTitles = new Set<string>();

  const pushItem = (raw: z.infer<typeof rawCuratedItemSchema> | undefined) => {
    if (!raw) return;
    const item = toCuratedItem(raw);
    if (!item) return;
    const key = item.title.toLowerCase();
    if (seenTitles.has(key)) return; // guard against top_story/items duplication
    seenTitles.add(key);
    items.push(item);
  };

  // Ensure the top story lands first and is tagged into the top_story section.
  if (data.top_story) {
    const top = toCuratedItem(data.top_story);
    if (top) {
      top.section = "top_story";
      seenTitles.add(top.title.toLowerCase());
      items.push(top);
    }
  }

  for (const raw of data.items ?? []) {
    pushItem(raw);
  }

  // Rank by score descending, but keep any top_story item pinned at the front.
  const [head, ...rest] = items;
  const ranked =
    head && head.section === "top_story"
      ? [head, ...rest.sort((a, b) => b.score - a.score)]
      : items.sort((a, b) => b.score - a.score);

  const headline =
    typeof data.headline === "string" && data.headline.trim().length > 0
      ? data.headline.trim()
      : "Today's frontier-tech briefing";
  const summary =
    typeof data.summary === "string" && data.summary.trim().length > 0
      ? data.summary.trim()
      : "A digest of the day's most notable AI and frontier-tech developments.";

  if (ranked.length === 0) return { ...empty, headline, summary };

  return { headline, summary, items: ranked };
}
