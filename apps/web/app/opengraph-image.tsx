import { ImageResponse } from "next/og";
import { loadEbGaramond } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Hyperpolymath — a unified life-OS with JARVIS at the centre.";

/**
 * Open Graph card — generated at build / request time so the wordmark stays
 * in EB Garamond and the rest of the chrome can evolve without re-rendering
 * a PNG by hand. White background per brand request; the type itself carries
 * the identity. Mirrors `app/twitter-image.tsx`.
 */
export default async function Image() {
  const [garamondBold, garamondItalic] = await Promise.all([
    loadEbGaramond(600, false),
    loadEbGaramond(400, true),
  ]);

  type FontOptions = {
    name: string;
    data: ArrayBuffer;
    weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
    style?: "normal" | "italic";
  };
  const fonts: FontOptions[] = [];
  if (garamondBold) {
    fonts.push({ name: "EB Garamond", data: garamondBold, weight: 600, style: "normal" });
  }
  if (garamondItalic) {
    fonts.push({ name: "EB Garamond", data: garamondItalic, weight: 400, style: "italic" });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px",
          fontFamily: "EB Garamond, Georgia, serif",
          color: "#1a1815",
        }}
      >
        {/* Top hairline — small mono chrome row. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 18,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#7a766f",
          }}
        >
          <span>HYPERPOLYMATH</span>
          <span>EST. 2026 / MIT</span>
        </div>

        {/* Centerpiece — the wordmark itself. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 168,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: "#1a1815",
            }}
          >
            Hyperpolymath
          </div>
          <div
            style={{
              fontSize: 30,
              fontStyle: "italic",
              fontWeight: 400,
              color: "#5a564f",
            }}
          >
            a life-OS, with JARVIS at the centre.
          </div>
        </div>

        {/* Bottom — ornament + URL hairline. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 18,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#7a766f",
          }}
        >
          <span>HYPERPOLYMATH.COM</span>
          <span
            style={{ fontSize: 22, color: "#a8a299", letterSpacing: 0 }}
            aria-hidden="true"
          >
            ⚜
          </span>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
