/**
 * /settings/nutrition — Nutrition targets settings page (NUTR-TARGETS-UI-01, D-09).
 *
 * Server Component shell: fetches current targets → passes to NutritionTargetsForm.
 * Pattern mirrors /settings/memory and /settings/desktop.
 *
 * No .agent-mode-scope — nutrition is a document-discipline surface per UI-SPEC
 * ("Do NOT apply .agent-mode-scope to nutrition pages").
 */

import { requireOnboarded } from "@/lib/auth/get-user";
import { getNutritionTargets } from "@/lib/nutrition/nutrition-service";
import { NutritionTargetsForm } from "@/components/nutrition/NutritionTargetsForm";

export const dynamic = "force-dynamic";

export default async function NutritionSettingsPage() {
  const user = await requireOnboarded();
  const targets = await getNutritionTargets(user.id);

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1
            className="text-[28px] leading-[1.2] text-[var(--ink)]"
            style={{ fontFamily: "var(--)" }}
          >
            Nutrition targets
          </h1>
          <p
            className="mt-2 text-[16px] leading-[1.5] text-[var(--ink-muted)]"
            style={{ fontFamily: "var(--)" }}
          >
            Set your daily calorie target and the macro split.
          </p>
        </header>

        <NutritionTargetsForm initialTargets={targets} />
      </div>
    </main>
  );
}
