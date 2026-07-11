import { useQuery } from "@tanstack/react-query";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { summonWidget } from "../state/widget-windows";
import { WIDGET_CATALOG } from "../windows/catalog";
import { fetchStudioWidget } from "./widget-fetch";

interface Article {
  title?: string;
  section?: string;
  published?: string;
  url?: string;
}

interface Receipt extends Record<string, unknown> {
  articles: Article[];
}

export default function NewsWidget(): React.ReactElement {
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "news"],
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/news"),
    refetchInterval: 30 * 60 * 1000,
  });
  if (isLoading) {
    return <div style={{ height: "100%", background: STUDIO_COLORS.surface }} />;
  }
  if (error) {
    return (
      <p style={{ padding: 16, color: STUDIO_COLORS.danger, fontSize: 12 }}>
        {error.message}
      </p>
    );
  }
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 12 }}>
      {(data?.articles ?? []).slice(0, 6).map((article, index) => (
        <button
          key={article.url ?? `${article.title}:${index}`}
          type="button"
          disabled={!article.url}
          onClick={() => {
            if (!article.url) return;
            const browser = WIDGET_CATALOG.browser;
            summonWidget("browser", { url: article.url }, undefined, {
              defaultSize: browser.defaultSize,
            });
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "9px 8px",
            border: 0,
            borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
            color: STUDIO_COLORS.text,
            background: "transparent",
            textAlign: "left",
            cursor: article.url ? "pointer" : "default",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, lineHeight: "16px" }}>
            {article.title ?? "Untitled"}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              color: STUDIO_COLORS.muted,
              fontFamily: STUDIO_MONO,
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {article.section ?? "The Guardian"}
          </p>
        </button>
      ))}
    </div>
  );
}
