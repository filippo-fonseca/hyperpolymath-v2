import * as React from "react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
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
        padding: 16,
        background: `linear-gradient(145deg, color-mix(in srgb, ${STUDIO_COLORS.accent} 8%, transparent), transparent 55%)`,
      }}
    >
      <header
        style={{
          paddingBottom: 10,
          borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
          color: STUDIO_COLORS.accent,
          fontFamily: STUDIO_MONO,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </header>
      <p
        style={{
          margin: "12px 0 0",
          overflowY: "auto",
          color: STUDIO_COLORS.text,
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
