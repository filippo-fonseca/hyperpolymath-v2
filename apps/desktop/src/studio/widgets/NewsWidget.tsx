import * as React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { summonWidget } from "../state/widget-windows";
import { WIDGET_CATALOG } from "../windows/catalog";
import { fetchStudioWidget } from "./widget-fetch";

interface Article {
  title?: string;
  section?: string;
  published?: string;
  trailText?: string;
  url?: string;
}

interface Receipt extends Record<string, unknown> {
  articles: Article[];
}

const MAX_ITEMS = 8;

/** Compact relative age, e.g. "now", "8m", "3h", "2d". */
function formatAge(published?: string): string | null {
  if (!published) return null;
  const then = new Date(published).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = Date.now() - then;
  if (diff < 0) return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function NewsRow({ article }: { article: Article }): React.ReactElement {
  const [active, setActive] = useState(false);
  const age = formatAge(article.published);
  const clickable = Boolean(article.url);

  const open = (): void => {
    if (!article.url) return;
    const browser = WIDGET_CATALOG.browser;
    summonWidget("browser", { url: article.url }, undefined, {
      defaultSize: browser.defaultSize,
    });
  };

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={open}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        display: "block",
        width: "100%",
        padding: "10px 12px",
        border: 0,
        borderLeft: `2px solid ${active && clickable ? STUDIO_COLORS.accent : "transparent"}`,
        borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
        color: STUDIO_COLORS.text,
        background:
          active && clickable
            ? `color-mix(in srgb, ${STUDIO_COLORS.accent} 9%, transparent)`
            : "transparent",
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        transition: "background 0.15s ease, border-color 0.15s ease",
        outline: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 5,
          color: STUDIO_COLORS.muted,
          fontFamily: STUDIO_MONO,
          fontSize: 8.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: active && clickable ? STUDIO_COLORS.accent : STUDIO_COLORS.muted,
          }}
        >
          {article.section ?? "The Guardian"}
        </span>
        {age ? (
          <>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span style={{ flexShrink: 0 }}>{age}</span>
          </>
        ) : null}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: "17px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {article.title ?? "Untitled"}
      </p>
    </button>
  );
}

function NewsSkeleton(): React.ReactElement {
  const reduced = useReducedMotion();
  return (
    <div style={{ padding: 0 }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          style={{
            padding: "12px",
            borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
          }}
        >
          {[9, "72%", "90%"].map((width, row) => (
            <motion.div
              key={row}
              style={{
                height: row === 0 ? 7 : 11,
                width: typeof width === "number" ? 96 : width,
                marginBottom: row === 2 ? 0 : 7,
                borderRadius: 3,
                background: `color-mix(in srgb, ${STUDIO_COLORS.muted} 22%, transparent)`,
              }}
              animate={reduced ? undefined : { opacity: [0.4, 0.8, 0.4] }}
              transition={{
                duration: 1.4,
                delay: index * 0.08,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function NewsWidget(): React.ReactElement {
  const { data, error, isLoading } = useQuery({
    queryKey: ["studio", "news"],
    queryFn: () => fetchStudioWidget<Receipt>("/api/studio/news"),
    refetchInterval: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <NewsSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 20,
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            color: STUDIO_COLORS.text,
            fontFamily: STUDIO_MONO,
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          News unavailable
        </p>
        <p
          style={{
            margin: 0,
            maxWidth: 260,
            color: STUDIO_COLORS.muted,
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          {error.message}
        </p>
      </div>
    );
  }

  const articles = (data?.articles ?? []).slice(0, MAX_ITEMS);

  if (articles.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          color: STUDIO_COLORS.muted,
          fontFamily: STUDIO_MONO,
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        No stories right now
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {articles.map((article, index) => (
        <NewsRow key={article.url ?? `${article.title}:${index}`} article={article} />
      ))}
    </div>
  );
}
