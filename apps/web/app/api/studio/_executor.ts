import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { createServerExecutor } from "@/lib/jarvis/executor";
import { DEFAULT_TIMEZONE, resolveUserTimezone } from "@/lib/jarvis/routine-fire";
import { createClient } from "@/lib/supabase/server";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

export async function studioUserId(request: Request): Promise<string | null> {
  const bearerUserId = await validateDesktopBearer(request);
  if (bearerUserId) return bearerUserId;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    return error ? null : ((data?.claims?.sub as string | undefined) ?? null);
  } catch {
    return null;
  }
}

export async function studioExecutorContext(
  request: Request
): Promise<{ executor: ReturnType<typeof createServerExecutor>; ctx: ExecutionContext } | null> {
  const userId = await studioUserId(request);
  if (!userId) return null;

  const userTimezone = await resolveUserTimezone(userId).catch(() => DEFAULT_TIMEZONE);
  return {
    executor: createServerExecutor(),
    ctx: {
      userId,
      source: { device: "Studio", input: "text" },
      userTimezone,
      defaultCalendarId: null,
    },
  };
}
