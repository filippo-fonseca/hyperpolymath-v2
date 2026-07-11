import { createClient } from "@/lib/supabase/server";
import { createServerExecutor } from "@/lib/jarvis/executor";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

export async function studioExecutorContext(): Promise<
  | { executor: ReturnType<typeof createServerExecutor>; ctx: ExecutionContext }
  | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return {
    executor: createServerExecutor(),
    ctx: {
      userId,
      source: { device: "Studio", input: "text" },
      userTimezone: "America/New_York",
      defaultCalendarId: null,
    },
  };
}
