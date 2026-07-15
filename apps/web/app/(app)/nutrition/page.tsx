import { requireOnboarded } from "@/lib/auth/get-user";
import { format } from "date-fns";
import {
  listFoodLogsForDay,
  getFoodHistory,
  getNutritionTargets,
} from "@/lib/nutrition/nutrition-service";
import { NutritionClient } from "@/components/nutrition/NutritionClient";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { NutritionIcon } from "@/components/nutrition/NutritionIcon";

/**
 * /nutrition — Server Component shell + NutritionClient island.
 *
 * Loads today's food logs, personal food history, and macro targets.
 * Hands everything to the client island as initial data so first paint
 * matches SSR (no loading state on the day view).
 *
 * Auth: requireOnboarded() → getClaims() under the hood (CLAUDE.md Critical
 * Pattern 1).
 *
 * The page owns the sd title row (Breadcrumbs + dimensional NutritionIcon +
 * mono eyebrow + "Nutrition." heading); the client owns the day content.
 *
 * NOTE: format(new Date(), "yyyy-MM-dd") produces local-timezone date, not UTC
 * (Pitfall 6 — per UI-SPEC). This is intentional.
 */
export default async function NutritionPage() {
  const user = await requireOnboarded();
  const today = format(new Date(), "yyyy-MM-dd");

  const [initialLogs, foodHistory, targets] = await Promise.all([
    listFoodLogsForDay(user.id, today),
    getFoodHistory(user.id, { limit: 20 }),
    getNutritionTargets(user.id),
  ]);

  return (
    <main
      className="min-h-full text-[var(--sd-ink)]"
      style={{ background: "var(--sd-app)" }}
    >
      <div className="mx-auto w-full max-w-[860px] px-6 md:px-8 pt-6 pb-24">
        <Breadcrumbs items={[{ label: "Nutrition" }]} className="mb-6" />
        <header className="mb-8 flex items-start gap-3.5">
          <span className="inline-flex shrink-0 items-center justify-center pt-0.5">
            <NutritionIcon size={30} />
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]">
              Fuel · Macros
            </span>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
              Nutrition<span className="text-[var(--sd-accent)]">.</span>
            </h1>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--sd-ink-dull)]">
              Log what you eat, watch the macros land against your targets.{" "}
              <span className="text-[var(--sd-ink-faint)]">
                Press <span className="font-mono">n</span> anywhere to add food.
              </span>
            </p>
          </div>
        </header>

        <NutritionClient
          userId={user.id}
          initialDate={today}
          initialLogs={initialLogs}
          foodHistory={foodHistory}
          targets={targets}
        />
      </div>
    </main>
  );
}
