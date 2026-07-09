import "server-only";

import { z } from "zod";
import type { BriefingItem, BriefingModelWatch, BriefingSection, BriefingSynthesis } from "./types";

const PLANNER_MODEL = process.env.BRIEFING_PLANNER_MODEL || "gpt-5.5";
const PLANNER_EFFORT = process.env.BRIEFING_PLANNER_EFFORT || "high";
const EXECUTOR_MODEL = process.env.BRIEFING_EXECUTOR_MODEL || "gpt-5-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SYNTHESIS_CACHE_TTL_MS = 60 * 60 * 1000;

let synthesisCache: { key: string; at: number; value: BriefingSynthesis } | null = null;

const synthesisSchema = z.object({
  summary: z.array(z.string()).min(3).max(7),
  topStories: z.array(z.string()).min(3).max(8),
  upcomingModels: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["announced", "rumored", "shipping", "benchmark"]),
        evidence: z.string(),
        url: z.string(),
        source: z.string(),
      })
    )
    .max(10),
  creatorPulse: z.array(z.string()).max(6),
  benchmarkWatch: z.array(z.string()).max(6),
  policyWatch: z.array(z.string()).max(6),
  bioWatch: z.array(z.string()).max(5),
  semiconductorWatch: z.array(z.string()).max(5),
  blindspots: z.array(z.string()).max(5),
});

type OpenAISynthesis = z.infer<typeof synthesisSchema>;

export function briefingModelConfig() {
  return {
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    plannerModel: PLANNER_MODEL,
    executorModel: EXECUTOR_MODEL,
  };
}

export async function synthesizeBriefing(items: BriefingItem[]): Promise<BriefingSynthesis> {
  const key = items
    .slice(0, 40)
    .map((item) => `${item.id}:${item.score}`)
    .join("|");
  if (
    synthesisCache &&
    synthesisCache.key === key &&
    Date.now() - synthesisCache.at < SYNTHESIS_CACHE_TTL_MS
  ) {
    return synthesisCache.value;
  }

  const heuristic = buildHeuristicSynthesis(items);
  const openai = await synthesizeWithOpenAI(items, heuristic).catch(() => null);
  const value = openai ?? heuristic;
  synthesisCache = { key, at: Date.now(), value };
  return value;
}

function buildHeuristicSynthesis(items: BriefingItem[]): BriefingSynthesis {
  const generatedAt = new Date().toISOString();
  const topStories = take(items, 8);
  const creatorItems = byCategory(items, "creators", 6);
  const benchmarkItems = byCategory(items, "benchmarks", 6);
  const policyItems = byCategory(items, "policy", 6);
  const bioItems = byCategory(items, "bio", 5);
  const semiconductorItems = byCategory(items, "semiconductors", 5);
  const upcomingModels = inferUpcomingModels(items);

  return {
    mode: "heuristic",
    model: null,
    generatedAt,
    summary: topStories.slice(0, 5).map((item) => `${item.title} (${item.source})`),
    topStories: section("Top stories", topStories),
    upcomingModels,
    creatorPulse: section("Creator pulse", creatorItems),
    benchmarkWatch: section("Benchmark watch", benchmarkItems),
    policyWatch: section("Policy watch", policyItems),
    bioWatch: section("Bio watch", bioItems),
    semiconductorWatch: section("Semiconductor watch", semiconductorItems),
    blindspots: [
      "X/Twitter and Discord discourse are not fetched unless a future authenticated integration is added.",
      "Rumor tracking is evidence-only; unsourced model dates are intentionally not fabricated.",
      "Some publishers do not expose stable RSS feeds, so source failures are shown separately.",
    ],
  };
}

async function synthesizeWithOpenAI(
  items: BriefingItem[],
  fallback: BriefingSynthesis
): Promise<BriefingSynthesis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const compactItems = items.slice(0, 45).map((item, index) => ({
    n: index + 1,
    title: item.title,
    source: item.source,
    category: item.category,
    date: item.publishedAt,
    url: item.url,
    summary: item.summary.slice(0, 240),
    tags: item.tags,
  }));

  const payload: Record<string, unknown> = {
    model: PLANNER_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a terse frontier-AI briefing planner. Use only supplied source items. Do not invent model launches, benchmark scores, dates, or creator claims. If evidence is weak, say so.",
      },
      {
        role: "user",
        content: `Create a daily briefing JSON object. Track AI labs, research, policy, chips, bio, creators, rumored/upcoming models, and benchmark movement.\n\nItems:\n${JSON.stringify(compactItems)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "briefing_synthesis",
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "summary",
            "topStories",
            "upcomingModels",
            "creatorPulse",
            "benchmarkWatch",
            "policyWatch",
            "bioWatch",
            "semiconductorWatch",
            "blindspots",
          ],
          properties: {
            summary: { type: "array", minItems: 3, maxItems: 7, items: { type: "string" } },
            topStories: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
            upcomingModels: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "status", "evidence", "url", "source"],
                properties: {
                  name: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["announced", "rumored", "shipping", "benchmark"],
                  },
                  evidence: { type: "string" },
                  url: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
            creatorPulse: { type: "array", maxItems: 6, items: { type: "string" } },
            benchmarkWatch: { type: "array", maxItems: 6, items: { type: "string" } },
            policyWatch: { type: "array", maxItems: 6, items: { type: "string" } },
            bioWatch: { type: "array", maxItems: 5, items: { type: "string" } },
            semiconductorWatch: { type: "array", maxItems: 5, items: { type: "string" } },
            blindspots: { type: "array", maxItems: 5, items: { type: "string" } },
          },
        },
      },
    },
  };

  if (PLANNER_MODEL.startsWith("gpt-5")) {
    payload.reasoning = { effort: PLANNER_EFFORT };
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { output_text?: string };
  if (!json.output_text) return null;

  const parsed = synthesisSchema.parse(JSON.parse(json.output_text));
  return mapOpenAISynthesis(parsed, items, fallback);
}

function mapOpenAISynthesis(
  parsed: OpenAISynthesis,
  items: BriefingItem[],
  fallback: BriefingSynthesis
): BriefingSynthesis {
  return {
    mode: "openai",
    model: PLANNER_MODEL,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary,
    topStories: {
      title: "Top stories",
      bullets: parsed.topStories,
      items: fallback.topStories.items,
    },
    upcomingModels: parsed.upcomingModels,
    creatorPulse: {
      title: "Creator pulse",
      bullets: parsed.creatorPulse,
      items: byCategory(items, "creators", 6),
    },
    benchmarkWatch: {
      title: "Benchmark watch",
      bullets: parsed.benchmarkWatch,
      items: byCategory(items, "benchmarks", 6),
    },
    policyWatch: {
      title: "Policy watch",
      bullets: parsed.policyWatch,
      items: byCategory(items, "policy", 6),
    },
    bioWatch: {
      title: "Bio watch",
      bullets: parsed.bioWatch,
      items: byCategory(items, "bio", 5),
    },
    semiconductorWatch: {
      title: "Semiconductor watch",
      bullets: parsed.semiconductorWatch,
      items: byCategory(items, "semiconductors", 5),
    },
    blindspots: parsed.blindspots.length > 0 ? parsed.blindspots : fallback.blindspots,
  };
}

function section(title: string, items: BriefingItem[]): BriefingSection {
  return {
    title,
    bullets: items.map((item) => `${item.title} (${item.source})`),
    items,
  };
}

function byCategory(
  items: BriefingItem[],
  category: BriefingItem["category"],
  limit: number
): BriefingItem[] {
  return take(
    items.filter((item) => item.category === category),
    limit
  );
}

function take(items: BriefingItem[], limit: number): BriefingItem[] {
  return [...items].sort((a, b) => b.score - a.score).slice(0, limit);
}

function inferUpcomingModels(items: BriefingItem[]): BriefingModelWatch[] {
  const patterns = [
    /gpt[-\s]?\d(?:\.\d+)?(?:[-\s]?[a-z]+)?/gi,
    /claude\s+\d(?:\.\d+)?(?:\s+[a-z]+)?/gi,
    /gemini\s+\d(?:\.\d+)?(?:\s+[a-z]+)?/gi,
    /grok\s+\d(?:\.\d+)?(?:\s+[a-z]+)?/gi,
    /llama\s+\d(?:\.\d+)?(?:\s+[a-z]+)?/gi,
    /deepseek[-\s]?[a-z0-9.]+/gi,
    /qwen[-\s]?[a-z0-9.]+/gi,
  ];
  const statusWords =
    /launch|release|ship|preview|upcoming|rumor|rumour|leak|benchmark|leaderboard/i;
  const found = new Map<string, BriefingModelWatch>();

  for (const item of items) {
    const text = `${item.title} ${item.summary}`;
    if (!statusWords.test(text)) continue;
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const name = normalizeModelName(match[0]);
        const status = inferModelStatus(text);
        if (!found.has(name)) {
          found.set(name, {
            name,
            status,
            evidence: item.title,
            url: item.url,
            source: item.source,
          });
        }
      }
    }
  }

  return [...found.values()].slice(0, 10);
}

function inferModelStatus(text: string): BriefingModelWatch["status"] {
  if (/rumor|rumour|leak|upcoming/i.test(text)) return "rumored";
  if (/benchmark|leaderboard|eval/i.test(text)) return "benchmark";
  if (/launch|release|ship|available|preview/i.test(text)) return "shipping";
  return "announced";
}

function normalizeModelName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/^Gpt/i, "GPT")
    .replace(/^Qwen/i, "Qwen")
    .replace(/^Deepseek/i, "DeepSeek");
}
