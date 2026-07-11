"use client";

import { useQuery } from "@tanstack/react-query";
import { STUDIOLO } from "../../materials/tokens";
import { WIDGET_CATALOG } from "@/lib/studio/windows/catalog";
import { summonWidget } from "@/lib/studio/state/widget-windows";
import { emitStudioCue } from "@/lib/studio/audio/cues";
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
  if (isLoading) return <div className="h-full animate-pulse opacity-20" style={{ background: STUDIOLO.moonlace }} />;
  if (error) return <p className="p-4 text-xs" style={{ color: STUDIOLO.emberAlarm }}>{error.message}</p>;
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-1">
        {(data?.articles ?? []).slice(0, 6).map((article, index) => (
          <button
            key={article.url ?? `${article.title}:${index}`}
            type="button"
            disabled={!article.url}
            onClick={() => {
              if (!article.url) return;
              const browser = WIDGET_CATALOG.browser;
              summonWidget("browser", { url: article.url }, undefined, { defaultSize: browser?.defaultSize });
              emitStudioCue("summon");
            }}
            className="block w-full rounded-md border-b px-2 py-2 text-left transition-colors hover:bg-white/5"
            style={{ borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 15%, transparent)` }}
          >
            <p className="line-clamp-2 text-xs leading-4">{article.title ?? "Untitled"}</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-wider" style={{ color: STUDIOLO.moonlace }}>{article.section ?? "The Guardian"}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
