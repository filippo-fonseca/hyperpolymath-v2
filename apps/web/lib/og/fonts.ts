/**
 * Fetch EB Garamond from Google Fonts at request time, returning the raw
 * woff2 ArrayBuffer that Next.js `ImageResponse` (satori under the hood) can
 * consume directly.
 *
 * We hit the public `fonts.googleapis.com/css2` CSS endpoint, regex the
 * `url(https://fonts.gstatic.com/.../...woff2)` line out of the returned
 * stylesheet, then fetch the binary. This is the documented Next.js / Vercel
 * OG pattern — works without committing font files to the repo.
 *
 * Returns null on any failure so callers can degrade to system fonts rather
 * than crash the route. OG image generation is best-effort: a missing font
 * still ships a usable card.
 */
export async function loadEbGaramond(
  weight: 400 | 500 | 600 | 700,
  italic: boolean,
): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      // The User-Agent decides which font format Google serves back. Modern
      // browser UA → woff2 (smaller). Satori handles woff2 natively in
      // Next.js 16's ImageResponse.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      },
      cache: "force-cache",
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(
      /url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/,
    );
    if (!match) return null;
    const fontRes = await fetch(match[1]!, { cache: "force-cache" });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}
