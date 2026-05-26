import { ImageResponse } from "next/og";
import { loadEbGaramond } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Browser favicon. A single serif "H" on the cream canvas tone, matching the
 * journal-paper register the app uses. Rendered at 64×64 — Next.js downsamples
 * to whatever the browser asks for (16, 32, 48). At 16px the H still reads
 * because EB Garamond's stem contrast is gentle.
 */
export default async function Icon() {
  const garamond = await loadEbGaramond(600, false);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f6f3ec",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "EB Garamond, Georgia, serif",
          fontWeight: 600,
          fontSize: 52,
          lineHeight: 1,
          color: "#1a1815",
          letterSpacing: "-0.02em",
          // Hairline edge so the icon reads as a contained chip even on light
          // browser chrome where the canvas tone is near-invisible.
          boxShadow: "inset 0 0 0 1px #d8d2c4",
          borderRadius: 8,
        }}
      >
        H
      </div>
    ),
    {
      ...size,
      fonts: garamond
        ? [{ name: "EB Garamond", data: garamond, weight: 600, style: "normal" }]
        : undefined,
    },
  );
}
