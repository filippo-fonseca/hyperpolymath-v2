/**
 * off-client.ts — OpenFoodFacts API client with Zod-typed response parsers.
 *
 * SERVER-SIDE ONLY. Imports `next` fetch options (revalidate) which are only
 * valid in Next.js server context.
 *
 * OFF API references (from RESEARCH.md):
 *   Search:  GET https://search.openfoodfacts.org/search
 *   Product: GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json
 *
 * Required User-Agent per OFF usage terms:
 *   "hyperpolymath-v2/1.0 (filifonsecacagnazzo@gmail.com)"
 *
 * RESEARCH Pitfall 2: Missing fields → default to 0 (not undefined).
 * RESEARCH Pitfall 4: product_quantity_unit === "ml" → baseUnit "ml".
 */

import { z } from "zod";

const OFF_USER_AGENT =
  "hyperpolymath-v2/1.0 (filifonsecacagnazzo@gmail.com)";

const SEARCH_URL = "https://search.openfoodfacts.org/search";
const PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * OFF nutriments object — field names use hyphenated keys with _100g suffix.
 * All fields optional; missing ones default to 0 (Pitfall 2).
 */
const NutrimentsSchema = z
  .object({
    "energy-kcal_100g": z.number().optional().default(0),
    proteins_100g: z.number().optional().default(0),
    carbohydrates_100g: z.number().optional().default(0),
    fat_100g: z.number().optional().default(0),
    fiber_100g: z.number().optional(),
    sodium_100g: z.number().optional(),
  })
  .passthrough(); // allow unknown extra fields from OFF

/**
 * A single OFF product as returned by both Search and Product endpoints.
 * All fields are optional because OFF data quality varies widely.
 */
const OffProductRawSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional().default(""),
  brands: z.string().optional(),
  nutriments: NutrimentsSchema.optional().default({
    "energy-kcal_100g": 0,
    proteins_100g: 0,
    carbohydrates_100g: 0,
    fat_100g: 0,
  }),
  serving_size: z.string().optional(),
  serving_quantity: z.union([z.number(), z.string()]).optional(),
  product_quantity_unit: z.string().optional(),
  quantity: z.string().optional(),
});

export type OffProductRaw = z.infer<typeof OffProductRawSchema>;

// ---------------------------------------------------------------------------
// Normalized type — what the rest of the app sees
// ---------------------------------------------------------------------------

export type NormalizedOffProduct = {
  offBarcode: string | null;
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  sodiumPer100g: number | null;
  baseUnit: "g" | "ml";
  servingSizeLabel: string | null;
  servingQuantity: number | null; // grams or ml for "1 serving"
};

/**
 * Parse a raw OFF product (from search hits array or product endpoint)
 * into our typed NormalizedOffProduct shape.
 *
 * Exported so it can be unit-tested directly without hitting the network.
 */
export function normalizeOffProduct(raw: unknown): NormalizedOffProduct {
  const parsed = OffProductRawSchema.parse(raw);
  const nm = parsed.nutriments;

  const baseUnit: "g" | "ml" =
    parsed.product_quantity_unit === "ml" ? "ml" : "g";

  // serving_quantity may come back as a numeric string from some OFF products
  const servingQuantity: number | null =
    typeof parsed.serving_quantity === "string"
      ? parseFloat(parsed.serving_quantity) || null
      : (parsed.serving_quantity ?? null);

  return {
    offBarcode: parsed.code ?? null,
    name: parsed.product_name || "Unknown product",
    brand: parsed.brands?.split(",")[0]?.trim() || null,
    kcalPer100g: nm["energy-kcal_100g"] ?? 0,
    proteinPer100g: nm["proteins_100g"] ?? 0,
    carbsPer100g: nm["carbohydrates_100g"] ?? 0,
    fatPer100g: nm["fat_100g"] ?? 0,
    fiberPer100g: nm["fiber_100g"] ?? null,
    sodiumPer100g: nm["sodium_100g"] ?? null,
    baseUnit,
    servingSizeLabel: parsed.serving_size ?? null,
    servingQuantity,
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers (server-side only — use Next.js fetch with revalidate)
// ---------------------------------------------------------------------------

export type OffSearchResult = {
  hits: NormalizedOffProduct[];
  count: number;
};

/**
 * Search OpenFoodFacts via Search-a-licious endpoint.
 * Cache: 5 minutes (results change infrequently).
 */
export async function offSearch(
  q: string,
  opts: { revalidate?: number } = {},
): Promise<OffSearchResult> {
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(q)}&json=1&page_size=20` +
    `&fields=code,product_name,brands,nutriments,serving_size,serving_quantity,product_quantity_unit`;

  const res = await fetch(url, {
    headers: { "User-Agent": OFF_USER_AGENT },
    next: { revalidate: opts.revalidate ?? 300 },
  });

  if (!res.ok) {
    throw new Error(`OFF search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    hits?: unknown[];
    count?: number;
  };

  return {
    hits: (data.hits ?? []).map(normalizeOffProduct),
    count: data.count ?? 0,
  };
}

/**
 * Fetch a single product by barcode from the OFF v2 product endpoint.
 * Cache: 1 hour (product data changes rarely).
 *
 * Returns null if the product is not found (status !== 1).
 */
export async function offProduct(
  barcode: string,
  opts: { revalidate?: number } = {},
): Promise<NormalizedOffProduct | null> {
  const url =
    `${PRODUCT_URL}/${encodeURIComponent(barcode)}.json` +
    `?fields=code,product_name,brands,nutriments,serving_size,serving_quantity,product_quantity_unit,quantity`;

  const res = await fetch(url, {
    headers: { "User-Agent": OFF_USER_AGENT },
    next: { revalidate: opts.revalidate ?? 3600 },
  });

  if (!res.ok) {
    throw new Error(`OFF product failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    product?: unknown;
    status?: number;
  };

  if (data.status !== 1) return null;
  return normalizeOffProduct(data.product);
}
