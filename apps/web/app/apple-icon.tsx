import { ImageResponse } from "next/og";
import { loadEbGaramond } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple touch icon (180×180). iOS uses this when the user adds the site to
 * their home screen; Safari also surfaces it in the tab + bookmark UI. Same
 * "H" wordmark as `icon.tsx`, scaled up so the type sits comfortably without
 * looking lonely at 180px.
 */
export default async function AppleIcon() {
  const garamond = await loadEbGaramond(600, false);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f6f3ec",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "EB Garamond, Georgia, serif",
          color: "#1a1815",
          letterSpacing: "-0.02em",
          // No outer rounded mask — iOS applies its own mask. We just paint
          // the full square so the corners look correct after iOS rounds them.
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 132,
            lineHeight: 1,
          }}
        >
          H
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#7a766f",
          }}
        >
          hyperpolymath
        </div>
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
