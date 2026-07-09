/**
 * OpenAI SDK client factory.
 *
 * Mirrors lib/jarvis/anthropic-client.ts: owner-system background paths (the
 * Briefing curation worker, cron) pass `process.env.OPENAI_API_KEY` explicitly.
 * We cache one client per distinct key so cold-start amortization is preserved
 * across requests without a hard process singleton.
 *
 * OpenAI (gpt-4o-mini) is the designated model for cheap background inference in
 * hyperpolymath — the owner has abundant OpenAI credits, so summarization /
 * clustering work routes here rather than to Claude Haiku.
 */

import OpenAI from "openai";

const clients = new Map<string, OpenAI>();

export function getOpenAIClient(apiKey: string): OpenAI {
  let client = clients.get(apiKey);
  if (!client) {
    client = new OpenAI({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

/** Resolve the owner-system OpenAI client, or null when no key is configured. */
export function getOwnerOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return getOpenAIClient(key);
}

// Cheap, fast model for background summarization / clustering.
export const OPENAI_MINI_MODEL = "gpt-4o-mini" as const;
