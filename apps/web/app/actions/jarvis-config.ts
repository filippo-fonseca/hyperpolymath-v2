"use server";

/**
 * JARVIS management — per-user PERSONALITY + STARTUP config (server actions).
 *
 * Two config objects, one row per user each (UNIQUE user_id), upserted via
 * onConflictDoUpdate:
 *   - personality: tunes JARVIS's spoken voice (preset + formality/verbosity/
 *     wit dials + freeform custom instructions). Consumed by run-turn.ts →
 *     buildPersonalityTuningBlock at prompt-build time.
 *   - startup: mirrors the desktop startup config (briefing flag, open-on-start
 *     list, Shortcuts). Read by the desktop via the bearer-auth GET route.
 *
 * Every action authenticates via getClaims() (never trusts a client userId),
 * Zod-validates input, and scopes reads/writes to the authed user (defense in
 * depth atop the RLS policies in migration 0025). Reads return the canonical
 * DEFAULT_* config when no row exists, so the caller always gets a full object.
 *
 * These are the actions the web-UI unit will import:
 *   getPersonalityConfig / updatePersonalityConfig
 *   getStartupConfig / updateStartupConfig
 */

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_PERSONALITY_CONFIG,
  DEFAULT_STARTUP_CONFIG,
  type PersonalityConfig,
  type StartupConfig,
} from "@hyperpolymath/jarvis-core";
import { db } from "@/lib/db";
import { jarvisPersonalityConfig, jarvisStartupConfig } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

const CONFIG_PATH = "/settings/jarvis";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

// ---------------------------------------------------------------------------
// Personality config
// ---------------------------------------------------------------------------

const PersonalitySchema = z.object({
  preset: z.enum(["canon", "minimal", "storyteller"]),
  formality: z.enum(["formal", "balanced", "casual"]),
  verbosity: z.enum(["concise", "balanced", "expansive"]),
  wit: z.enum(["dry", "moderate", "playful"]),
  // Empty string is normalized to null (no custom directives).
  customInstructions: z.string().max(2000).nullable().optional(),
});

export type UpdatePersonalityInput = z.input<typeof PersonalitySchema>;

function rowToPersonality(row: typeof jarvisPersonalityConfig.$inferSelect): PersonalityConfig {
  return {
    preset: row.preset as PersonalityConfig["preset"],
    formality: row.formality as PersonalityConfig["formality"],
    verbosity: row.verbosity as PersonalityConfig["verbosity"],
    wit: row.wit as PersonalityConfig["wit"],
    customInstructions: row.customInstructions ?? null,
  };
}

export async function getPersonalityConfig(): Promise<ActionResult<PersonalityConfig>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  try {
    const [row] = await db
      .select()
      .from(jarvisPersonalityConfig)
      .where(eq(jarvisPersonalityConfig.userId, userId))
      .limit(1);
    return { success: true, data: row ? rowToPersonality(row) : { ...DEFAULT_PERSONALITY_CONFIG } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updatePersonalityConfig(
  input: UpdatePersonalityInput,
): Promise<ActionResult<PersonalityConfig>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const parsed = PersonalitySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  const custom = parsed.data.customInstructions?.trim();
  const values = {
    preset: parsed.data.preset,
    formality: parsed.data.formality,
    verbosity: parsed.data.verbosity,
    wit: parsed.data.wit,
    customInstructions: custom && custom.length > 0 ? custom : null,
  };

  try {
    const now = new Date();
    const [row] = await db
      .insert(jarvisPersonalityConfig)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: jarvisPersonalityConfig.userId,
        set: {
          preset: sql`excluded.preset`,
          formality: sql`excluded.formality`,
          verbosity: sql`excluded.verbosity`,
          wit: sql`excluded.wit`,
          customInstructions: sql`excluded.custom_instructions`,
          updatedAt: now,
        },
      })
      .returning();

    revalidatePath(CONFIG_PATH);
    return { success: true, data: rowToPersonality(row!) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Startup config
// ---------------------------------------------------------------------------

const StartupSchema = z.object({
  briefingEnabled: z.boolean(),
  openOnStart: z
    .array(
      z.object({
        type: z.enum(["url", "app"]),
        value: z.string().min(1).max(2000),
      }),
    )
    .max(50),
  startupShortcuts: z.array(z.string().min(1).max(200)).max(50),
});

export type UpdateStartupInput = z.input<typeof StartupSchema>;

function rowToStartup(row: typeof jarvisStartupConfig.$inferSelect): StartupConfig {
  return {
    briefingEnabled: row.briefingEnabled,
    openOnStart: row.openOnStart,
    startupShortcuts: row.startupShortcuts,
  };
}

export async function getStartupConfig(): Promise<ActionResult<StartupConfig>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  try {
    const [row] = await db
      .select()
      .from(jarvisStartupConfig)
      .where(eq(jarvisStartupConfig.userId, userId))
      .limit(1);
    return { success: true, data: row ? rowToStartup(row) : { ...DEFAULT_STARTUP_CONFIG } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateStartupConfig(
  input: UpdateStartupInput,
): Promise<ActionResult<StartupConfig>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Not signed in" };

  const parsed = StartupSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  try {
    const now = new Date();
    const [row] = await db
      .insert(jarvisStartupConfig)
      .values({
        userId,
        briefingEnabled: parsed.data.briefingEnabled,
        openOnStart: parsed.data.openOnStart,
        startupShortcuts: parsed.data.startupShortcuts,
      })
      .onConflictDoUpdate({
        target: jarvisStartupConfig.userId,
        set: {
          briefingEnabled: sql`excluded.briefing_enabled`,
          openOnStart: sql`excluded.open_on_start`,
          startupShortcuts: sql`excluded.startup_shortcuts`,
          updatedAt: now,
        },
      })
      .returning();

    revalidatePath(CONFIG_PATH);
    return { success: true, data: rowToStartup(row!) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
