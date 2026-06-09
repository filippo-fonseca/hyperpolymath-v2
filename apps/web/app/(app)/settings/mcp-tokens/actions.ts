"use server";

/**
 * Server Actions for /settings/mcp-tokens.
 *
 * Phase 999.12 Plan 05 / MCP-05. Thin auth-wrapping layer over the
 * helpers in apps/web/lib/mcp/mint-token.ts. Three responsibilities:
 *   1. Re-derive userId from getClaims() (CLAUDE.md Critical Pattern 1 —
 *      never trust a client-supplied userId; getSession() is forbidden).
 *   2. Validate user input (label) before touching the helpers.
 *   3. revalidatePath("/settings/mcp-tokens") so the Server Component
 *      re-fetches the token row after a mint or revoke.
 *
 * v1 limit: ONE mcp_agent token per user. mintMcpToken's
 * onConflictDoUpdate semantics mean a second mint overwrites the first.
 * The Client island's copy makes this explicit.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mintMcpToken, revokeMcpToken } from "@/lib/mcp/mint-token";

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

const LabelSchema = z
  .string()
  .min(1, "Name required.")
  .max(100, "Name too long (max 100 chars).")
  .transform((s) => s.trim());

export async function mintMcpTokenAction(
  name: string,
): Promise<ActionResult<{ plaintext: string; name: string }>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Unauthorized" };

  const parsed = LabelSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid name.",
    };
  }

  const r = await mintMcpToken(userId, parsed.data);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/settings/mcp-tokens");
  return {
    ok: true,
    data: { plaintext: r.data.plaintext, name: parsed.data },
  };
}

export async function revokeMcpTokenAction(): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Unauthorized" };

  const r = await revokeMcpToken(userId);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/settings/mcp-tokens");
  return { ok: true };
}
