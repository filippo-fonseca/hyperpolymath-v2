import { ImageResponse } from "next/og";
import {
  ASSETS,
  THEMES,
  renderAssetJsx,
  renderAssetSvg,
  type AssetId,
  type ThemeKey,
} from "@/lib/branding/svg";
import { loadEbGaramond } from "@/lib/og/fonts";

export const runtime = "nodejs";

/**
 * Unified brand asset endpoint.
 *
 *   GET /api/branding/asset?id=<assetId>&theme=<theme>&format=svg|png&download=1
 *
 * Returns a single SVG (image/svg+xml, EB Garamond embedded as base64 woff2)
 * or PNG (image/png via next/og ImageResponse). `download=1` adds a
 * Content-Disposition: attachment header so a plain anchor triggers a
 * save dialog.
 *
 * Asset and theme registries live in `lib/branding/svg.ts` — both renderers
 * share the same geometry so PNG and SVG stay visually identical.
 */

function isAsset(s: string): s is AssetId {
  return s in ASSETS;
}

function isTheme(s: string): s is ThemeKey {
  return s in THEMES;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idRaw = url.searchParams.get("id") ?? "wordmark";
  const themeRaw = url.searchParams.get("theme") ?? "paper";
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const download = url.searchParams.get("download") === "1";

  const id: AssetId = isAsset(idRaw) ? idRaw : "wordmark";
  const theme: ThemeKey = isTheme(themeRaw) ? themeRaw : "paper";
  const { width, height } = ASSETS[id].size;

  if (format === "svg") {
    const svg = await renderAssetSvg(id, theme);
    const headers: Record<string, string> = {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    };
    if (download) {
      headers["content-disposition"] =
        `attachment; filename="hyperpolymath-${id}-${theme}.svg"`;
    }
    return new Response(svg, { status: 200, headers });
  }

  // PNG path
  const [bold, regular] = await Promise.all([
    loadEbGaramond(600, false),
    loadEbGaramond(400, false),
  ]);
  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 600;
    style: "normal";
  }> = [];
  if (bold)
    fonts.push({ name: "EB Garamond", data: bold, weight: 600, style: "normal" });
  if (regular)
    fonts.push({
      name: "EB Garamond",
      data: regular,
      weight: 400,
      style: "normal",
    });

  const response = new ImageResponse(renderAssetJsx(id, theme), {
    width,
    height,
    fonts: fonts.length > 0 ? fonts : undefined,
  });

  if (download) {
    response.headers.set(
      "content-disposition",
      `attachment; filename="hyperpolymath-${id}-${theme}.png"`,
    );
  }
  response.headers.set("cache-control", "public, max-age=300, s-maxage=3600");
  return response;
}
