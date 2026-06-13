/**
 * macro-math.test.ts — pure function unit tests for computeMacros, resolveBaseAmount,
 * validateMacroConsistency, and deriveTargetGrams.
 *
 * No mocks needed — these are pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  resolveBaseAmount,
  computeMacros,
  validateMacroConsistency,
  deriveTargetGrams,
} from "@/lib/nutrition/macro-math";

describe("resolveBaseAmount", () => {
  it("returns quantity × servingGramsOrMl", () => {
    expect(resolveBaseAmount(2, 50)).toBe(100);
  });

  it("handles fractional quantity", () => {
    expect(resolveBaseAmount(1.5, 80)).toBe(120);
  });

  it("handles 1 × 100 = 100", () => {
    expect(resolveBaseAmount(1, 100)).toBe(100);
  });
});

describe("computeMacros", () => {
  it("banana 100g baseline — identity check", () => {
    const result = computeMacros(100, {
      kcalPer100g: "52",
      proteinPer100g: "1.3",
      carbsPer100g: "14",
      fatPer100g: "0.3",
    });
    expect(result.kcal).toBe(52);
    expect(result.proteinG).toBeCloseTo(1.3, 1);
    expect(result.carbsG).toBeCloseTo(14, 1);
    expect(result.fatG).toBeCloseTo(0.3, 1);
  });

  it("RxBar-ish at 56g — kcal rounded to integer", () => {
    const result = computeMacros(56, {
      kcalPer100g: "440",
      proteinPer100g: "5",
      carbsPer100g: "78",
      fatPer100g: "12",
    });
    // 440 × 56 / 100 = 246.4 → 246
    expect(result.kcal).toBe(246);
  });

  it("accepts numeric (not string) macro values", () => {
    const result = computeMacros(200, {
      kcalPer100g: 100,
      proteinPer100g: 10,
      carbsPer100g: 20,
      fatPer100g: 5,
    });
    expect(result.kcal).toBe(200);
    expect(result.proteinG).toBe(20);
    expect(result.carbsG).toBe(40);
    expect(result.fatG).toBe(10);
  });

  it("returns null fiberG when fiberPer100g is not provided", () => {
    const result = computeMacros(100, {
      kcalPer100g: "52",
      proteinPer100g: "1.3",
      carbsPer100g: "14",
      fatPer100g: "0.3",
    });
    expect(result.fiberG).toBeNull();
  });

  it("computes fiberG when fiberPer100g provided", () => {
    const result = computeMacros(100, {
      kcalPer100g: "52",
      proteinPer100g: "1.3",
      carbsPer100g: "14",
      fatPer100g: "0.3",
      fiberPer100g: "2.6",
    });
    expect(result.fiberG).toBeCloseTo(2.6, 1);
  });
});

describe("validateMacroConsistency", () => {
  it("returns true when derived is within 15% of stated kcal", () => {
    // derived = 5*4 + 10*4 + 5*9 = 20 + 40 + 45 = 105; stated = 100; diff = 5% → true
    const result = validateMacroConsistency({
      kcal: 100,
      proteinG: 5,
      carbsG: 10,
      fatG: 5,
    });
    expect(result).toBe(true);
  });

  it("returns false when derived is more than 15% from stated kcal", () => {
    // derived = 50*4 = 200; stated = 100; 100% diverge → false
    const result = validateMacroConsistency({
      kcal: 100,
      proteinG: 50,
      carbsG: 0,
      fatG: 0,
    });
    expect(result).toBe(false);
  });

  it("returns true for a perfectly consistent meal", () => {
    // 25g protein = 100 kcal, 25g carbs = 100 kcal, 0g fat → 200 kcal
    const result = validateMacroConsistency({
      kcal: 200,
      proteinG: 25,
      carbsG: 25,
      fatG: 0,
    });
    expect(result).toBe(true);
  });
});

describe("deriveTargetGrams", () => {
  it("2000 kcal, 30/40/30 → 150g P / 200g C / ~67g F", () => {
    const result = deriveTargetGrams({
      targetKcal: 2000,
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
    });
    expect(result.proteinG).toBe(150);
    expect(result.carbsG).toBe(200);
    // (2000 * 0.30) / 9 = 66.67 → rounded to 67
    expect(result.fatG).toBeCloseTo(67, 0);
  });

  it("handles 25/50/25 split at 2500 kcal", () => {
    const result = deriveTargetGrams({
      targetKcal: 2500,
      proteinPct: 25,
      carbsPct: 50,
      fatPct: 25,
    });
    // protein = (2500 * 25/100) / 4 = 625/4 = 156.25 → 156
    expect(result.proteinG).toBe(156);
    // carbs = (2500 * 50/100) / 4 = 1250/4 = 312.5 → 313
    expect(result.carbsG).toBe(313);
    // fat = (2500 * 25/100) / 9 = 625/9 = 69.44 → 69
    expect(result.fatG).toBe(69);
  });
});
