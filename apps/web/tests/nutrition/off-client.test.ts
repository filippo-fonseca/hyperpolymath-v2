/**
 * off-client.test.ts — unit tests for the OpenFoodFacts client Zod parsers.
 *
 * The fetch helper (offSearch, offProduct) is tested at the integration level
 * (route handlers). Here we focus on `normalizeOffProduct` which is the
 * boundary that accepts raw OFF API JSON and returns our typed shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeOffProduct } from "@/lib/nutrition/off-client";

// ---------------------------------------------------------------------------
// normalizeOffProduct — Zod parse + field normalization
// ---------------------------------------------------------------------------

describe("normalizeOffProduct", () => {
  it("accepts fixture with hyphenated keys and returns typed shape", () => {
    const raw = {
      code: "0123456789",
      product_name: "Test Banana",
      brands: "Dole, Chiquita",
      nutriments: {
        "energy-kcal_100g": 89,
        "proteins_100g": 1.1,
        "carbohydrates_100g": 22.8,
        "fat_100g": 0.3,
        "fiber_100g": 2.6,
        "sodium_100g": 0.001,
      },
      serving_size: "1 medium (118g)",
      serving_quantity: 118,
      product_quantity_unit: "g",
    };

    const result = normalizeOffProduct(raw);

    expect(result.offBarcode).toBe("0123456789");
    expect(result.name).toBe("Test Banana");
    expect(result.brand).toBe("Dole"); // first brand only
    expect(result.kcalPer100g).toBe(89);
    expect(result.proteinPer100g).toBe(1.1);
    expect(result.carbsPer100g).toBe(22.8);
    expect(result.fatPer100g).toBe(0.3);
    expect(result.fiberPer100g).toBe(2.6);
    expect(result.sodiumPer100g).toBe(0.001);
    expect(result.baseUnit).toBe("g");
    expect(result.servingQuantity).toBe(118);
    expect(result.servingSizeLabel).toBe("1 medium (118g)");
  });

  it("missing nutriment fields default to 0", () => {
    const raw = {
      code: "9999",
      product_name: "Sparse Product",
      nutriments: {
        // only kcal present; proteins, carbs, fat all missing
        "energy-kcal_100g": 50,
      },
    };

    const result = normalizeOffProduct(raw);

    expect(result.kcalPer100g).toBe(50);
    expect(result.proteinPer100g).toBe(0);
    expect(result.carbsPer100g).toBe(0);
    expect(result.fatPer100g).toBe(0);
    expect(result.fiberPer100g).toBeNull();
  });

  it("detects baseUnit 'ml' when product_quantity_unit is ml", () => {
    const raw = {
      code: "ml-drink",
      product_name: "Coconut Water",
      nutriments: {
        "energy-kcal_100g": 20,
        "proteins_100g": 0.1,
        "carbohydrates_100g": 5,
        "fat_100g": 0.1,
      },
      product_quantity_unit: "ml",
    };

    const result = normalizeOffProduct(raw);

    expect(result.baseUnit).toBe("ml");
  });

  it("defaults to baseUnit 'g' when product_quantity_unit is absent", () => {
    const raw = {
      code: "solid-food",
      product_name: "Rice",
      nutriments: {
        "energy-kcal_100g": 360,
        "proteins_100g": 7,
        "carbohydrates_100g": 79,
        "fat_100g": 0.6,
      },
    };

    const result = normalizeOffProduct(raw);

    expect(result.baseUnit).toBe("g");
  });

  it("handles serving_quantity as string (numeric string from OFF)", () => {
    const raw = {
      code: "str-serving",
      product_name: "Pasta",
      nutriments: {
        "energy-kcal_100g": 358,
        "proteins_100g": 13,
        "carbohydrates_100g": 71,
        "fat_100g": 1.5,
      },
      serving_quantity: "80", // string variant observed in the wild
    };

    const result = normalizeOffProduct(raw);

    expect(result.servingQuantity).toBe(80);
  });

  it("returns null offBarcode when code is absent", () => {
    const raw = {
      product_name: "No Barcode",
      nutriments: {
        "energy-kcal_100g": 100,
        "proteins_100g": 5,
        "carbohydrates_100g": 10,
        "fat_100g": 5,
      },
    };

    const result = normalizeOffProduct(raw);

    expect(result.offBarcode).toBeNull();
  });

  it("handles empty nutriments object — all macros default to 0", () => {
    const raw = {
      code: "empty-nutr",
      product_name: "Unknown",
      nutriments: {},
    };

    const result = normalizeOffProduct(raw);

    expect(result.kcalPer100g).toBe(0);
    expect(result.proteinPer100g).toBe(0);
    expect(result.carbsPer100g).toBe(0);
    expect(result.fatPer100g).toBe(0);
  });

  it("uses 'Unknown product' as name fallback when product_name is absent", () => {
    const raw = {
      code: "no-name",
      nutriments: {},
    };

    const result = normalizeOffProduct(raw);

    expect(result.name).toBe("Unknown product");
  });
});
