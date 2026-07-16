"use client";

/**
 * ManualEntryForm — manual food creation form.
 *
 * UI-SPEC copywriting: "Add a food manually" heading.
 * Implements NUTR-MANUAL-01 (D-03).
 *
 * Flow: upsertFoodAction({ ...input, isManual: true }) → onCreated(food)
 * so the parent (FoodSearch) can immediately proceed to ServingPicker.
 */

import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { upsertFoodAction } from "@/app/actions/nutrition";

type ManualFoodFormValues = {
  name: string;
  brand: string;
  kcalPer100g: string;
  proteinPer100g: string;
  carbsPer100g: string;
  fatPer100g: string;
  fiberPer100g: string;
  baseUnit: "g" | "ml";
  servingLabel: string;
  servingGramsOrMl: string;
};

export type CreatedFoodResult = {
  id: string;
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number | null;
  baseUnit: "g" | "ml";
  servingSizeLabel: string | null;
  servingQuantity: number | null;
};

interface Props {
  initialName?: string;
  onCreated: (food: CreatedFoodResult) => void;
  onCancel: () => void;
}

export function ManualEntryForm({ initialName, onCreated, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ManualFoodFormValues>({
    defaultValues: {
      name: initialName ?? "",
      brand: "",
      kcalPer100g: "",
      proteinPer100g: "",
      carbsPer100g: "",
      fatPer100g: "",
      fiberPer100g: "",
      baseUnit: "g",
      servingLabel: "",
      servingGramsOrMl: "",
    },
  });

  async function onSubmit(values: ManualFoodFormValues) {
    // Manual validation since we're not using zodResolver
    if (!values.name.trim()) {
      setError("name", { message: "Name is required" });
      return;
    }
    const kcal = parseFloat(values.kcalPer100g);
    const protein = parseFloat(values.proteinPer100g);
    const carbs = parseFloat(values.carbsPer100g);
    const fat = parseFloat(values.fatPer100g);

    if (isNaN(kcal) || kcal < 0 || isNaN(protein) || protein < 0 || isNaN(carbs) || carbs < 0 || isNaN(fat) || fat < 0) {
      setError("root", { message: "All macro fields must be valid numbers ≥ 0." });
      return;
    }

    const fiber = values.fiberPer100g ? parseFloat(values.fiberPer100g) : null;
    const servingGrams = values.servingGramsOrMl ? parseFloat(values.servingGramsOrMl) : null;

    const result = await upsertFoodAction({
      name: values.name.trim(),
      brand: values.brand.trim() || undefined,
      kcalPer100g: kcal,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
      fiberPer100g: fiber,
      baseUnit: values.baseUnit,
      isManual: true,
      servingSizeLabel: values.servingLabel.trim() || null,
      servingQuantity: values.servingLabel.trim() && servingGrams ? servingGrams : null,
    });

    if (!result.success) {
      setError("root", { message: result.error });
      return;
    }

    onCreated({
      id: result.data.id,
      name: values.name.trim(),
      brand: values.brand.trim() || null,
      kcalPer100g: kcal,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
      fiberPer100g: fiber,
      baseUnit: values.baseUnit,
      servingSizeLabel: values.servingLabel.trim() || null,
      servingQuantity: values.servingLabel.trim() && servingGrams ? servingGrams : null,
    });
  }

  const labelClass =
    "block font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] mb-1";
  const fieldClass = "flex flex-col gap-1";
  const errorClass = "font-mono text-[10.5px] text-[var(--ink-coral)]";

  return (
    <div className="flex flex-col gap-4">
      {/* Heading */}
      <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
        Add a food manually
      </h3>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Root error */}
        {errors.root && (
          <p className={errorClass}>{errors.root.message}</p>
        )}

        {/* Name */}
        <div className={fieldClass}>
          <label className={labelClass}>Name *</label>
          <Input {...register("name")} placeholder="e.g. Chicken breast" />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        {/* Brand */}
        <div className={fieldClass}>
          <label className={labelClass}>Brand (optional)</label>
          <Input {...register("brand")} placeholder="e.g. Trader Joe's" />
        </div>

        {/* Macros per 100g row */}
        <div className="grid grid-cols-2 gap-3">
          <div className={fieldClass}>
            <label className={labelClass}>Kcal / 100g *</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              {...register("kcalPer100g")}
              placeholder="0"
            />
            {errors.kcalPer100g && (
              <p className={errorClass}>{errors.kcalPer100g.message}</p>
            )}
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>Protein / 100g *</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              {...register("proteinPer100g")}
              placeholder="0"
            />
            {errors.proteinPer100g && (
              <p className={errorClass}>{errors.proteinPer100g.message}</p>
            )}
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>Carbs / 100g *</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              {...register("carbsPer100g")}
              placeholder="0"
            />
            {errors.carbsPer100g && (
              <p className={errorClass}>{errors.carbsPer100g.message}</p>
            )}
          </div>
          <div className={fieldClass}>
            <label className={labelClass}>Fat / 100g *</label>
            <Input
              type="number"
              step="0.1"
              min="0"
              {...register("fatPer100g")}
              placeholder="0"
            />
            {errors.fatPer100g && (
              <p className={errorClass}>{errors.fatPer100g.message}</p>
            )}
          </div>
        </div>

        {/* Fiber (optional) */}
        <div className={fieldClass}>
          <label className={labelClass}>Fiber / 100g (optional)</label>
          <Input
            type="number"
            step="0.1"
            min="0"
            {...register("fiberPer100g")}
            placeholder="0"
          />
        </div>

        {/* Base unit */}
        <div className={fieldClass}>
          <label className={labelClass}>Base unit</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="g"
                {...register("baseUnit")}
                className="accent-[var(--sd-accent)]"
              />
              <span className="font-mono text-[10.5px] text-[var(--sd-ink)]">
                Grams (g)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="ml"
                {...register("baseUnit")}
                className="accent-[var(--sd-accent)]"
              />
              <span className="font-mono text-[10.5px] text-[var(--sd-ink)]">
                Millilitres (ml)
              </span>
            </label>
          </div>
        </div>

        {/* Serving info (optional) */}
        <div className="flex flex-col gap-3 border-t border-[var(--sd-line)] pt-3">
          <p className={labelClass}>Serving info (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldClass}>
              <label className={labelClass}>Label (e.g. "1 cup")</label>
              <Input {...register("servingLabel")} placeholder="1 serving" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>g / ml per serving</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                {...register("servingGramsOrMl")}
                placeholder="240"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="font-mono text-[11px] uppercase tracking-[0.06em]"
          >
            {isSubmitting ? "Saving…" : "Save food"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="font-mono text-[11px] uppercase tracking-[0.06em]"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
