/**
 * GET /api/nutrition/product/{barcode}
 *
 * Proxies to OpenFoodFacts v2 product endpoint.
 * Returns { product: NormalizedOffProduct, status: 1 } on success.
 * Returns { product: null, status: 0 } with 404 if product not found.
 *
 * Auth: requireOnboarded() — scanned barcodes must be from an authenticated session.
 * Cache: 1 hour via off-client.ts (next: { revalidate: 3600 }).
 *
 * NOTE: Next.js 16 — params are a Promise (App Router convention change).
 */

import { NextResponse } from "next/server";
import { requireOnboarded } from "@/lib/auth/get-user";
import { offProduct } from "@/lib/nutrition/off-client";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ barcode: string }> },
) {
  // Auth gate
  await requireOnboarded();

  const { barcode } = await params;

  if (!barcode || barcode.trim().length < 4) {
    return NextResponse.json(
      { product: null, status: 0, error: "Invalid barcode" },
      { status: 400 },
    );
  }

  try {
    const product = await offProduct(barcode.trim());

    if (!product) {
      return NextResponse.json({ product: null, status: 0 }, { status: 404 });
    }

    return NextResponse.json({ product, status: 1 });
  } catch (err) {
    console.error(`[/api/nutrition/product/${barcode}] OFF upstream error:`, err);
    return NextResponse.json(
      { product: null, status: 0, error: String(err) },
      { status: 502 },
    );
  }
}
