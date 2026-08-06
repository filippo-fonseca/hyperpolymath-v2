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

export default async function NutritionSettingsPage() {
  const user = await requireOnboarded();
  const targets = await getNutritionTargets(user.id);

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="text-micro text-[var(--ink-faint)]">
            Settings · Nutrition
          </p>
          {/* The two `fontFamily: "var(--)"` style props here were dead — an
              unfinished token name resolving to nothing. Dropped rather than
              guessed at; the inherited family was always what rendered. */}
          <h1 className="mt-1 text-display font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--ink)]">
            Nutrition targets
          </h1>
          <p className="mt-2 text-subtitle leading-[1.5] text-[var(--ink-muted)]">
            Set your daily calorie target and the macro split.
          </p>
        </header>

        <NutritionTargetsForm initialTargets={targets} />
      </div>
    </main>
  );
}
