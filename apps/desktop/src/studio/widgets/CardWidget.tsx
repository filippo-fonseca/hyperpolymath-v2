import * as React from "react";

import { SD_FONT, SD_INK, SD_SURFACES } from "../tokens";
import type { WidgetContentProps } from "../windows/catalog";

function textProp(
  props: Record<string, unknown>,
  key: "title" | "body",
  fallback: string,
): string {
  const value = props[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function CardWidget({ props }: WidgetContentProps): React.ReactElement {
  const title = textProp(props, "title", "JARVIS");
  const body = textProp(props, "body", "Done.");

  return (
    <article
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        // Card v2 body padding. The 14px radius, the frame border and the inset
        // hairline all belong to WidgetWindow — a second bordered card in here
        // would be the border-in-border nesting DS §9 bans.
        padding: 20,
        background: SD_SURFACES.box,
      }}
    >
      <header
        style={{
          paddingBottom: 10,
          borderBottom: `1px solid ${SD_SURFACES.line}`,
          color: SD_INK.faint,
          fontFamily: SD_FONT.mono,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </header>
      <p
        style={{
          margin: "12px 0 0",
          overflowY: "auto",
          color: SD_INK.dull,
          fontFamily: SD_FONT.sans,
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
      </p>
    </article>
  );
}
