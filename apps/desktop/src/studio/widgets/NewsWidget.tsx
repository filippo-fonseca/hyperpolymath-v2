import * as React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { NewsIcon } from "@hyperpolymath/ui-icons";

import { SD_FONT, SD_INK, SD_SURFACES } from "../tokens";
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

const shellStyle: React.CSSProperties = {
  height: "100%",
  background: SD_SURFACES.box,
};

function NewsRow({ article }: { article: Article }): React.ReactElement {
  const [active, setActive] = useState(false);
  const age = formatAge(article.published);
  const clickable = Boolean(article.url);
  const lit = active && clickable;

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
        borderBottom: `1px solid ${SD_SURFACES.line}`,
        color: SD_INK.base,
        // Two-tier law (DS §4): hover is a NEUTRAL backplate. The old accent
        // tint + accent left bar was an accent-filled row, which §16 bans.
        background: lit ? SD_SURFACES.hover : "transparent",
        fontFamily: SD_FONT.sans,
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        transition: "background-color 0.15s ease",
        outline: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 5,
          color: lit ? SD_INK.dull : SD_INK.faint,
          fontFamily: SD_FONT.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          transition: "color 0.15s ease",
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {article.section ?? "The Guardian"}
        </span>
        {age ? (
          <>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{age}</span>
          </>
        ) : null}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: "17px",
          letterSpacing: "-0.01em",
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
            borderBottom: `1px solid ${SD_SURFACES.line}`,
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
                background: SD_SURFACES.input,
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

/** Mono eyebrow over a 40px dimensional icon — the DS §9 empty/error voice. */
function NewsNotice({
  headline,
  detail,
}: {
  headline: string;
  detail?: string;
}): React.ReactElement {
  return (
    <div
      style={{
        ...shellStyle,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 20,
        textAlign: "center",
      }}
    >
      {/* 40px at 40% opacity (DS §9); the icons take no style prop, so the
          opacity rides a wrapper. */}
      <span style={{ opacity: 0.4, lineHeight: 0 }}>
        <NewsIcon size={40} />
      </span>
      <p
        style={{
          margin: 0,
          color: SD_INK.faint,
          fontFamily: SD_FONT.mono,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {headline}
      </p>
      {detail ? (
        <p
          style={{
            margin: 0,
            maxWidth: 260,
            color: SD_INK.dull,
            fontFamily: SD_FONT.sans,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {detail}
        </p>
      ) : null}
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
      <div style={{ ...shellStyle, overflow: "hidden" }}>
        <NewsSkeleton />
      </div>
    );
  }

  if (error) {
    return <NewsNotice headline="News unavailable" detail={error.message} />;
  }

  const articles = (data?.articles ?? []).slice(0, MAX_ITEMS);

  if (articles.length === 0) {
    return <NewsNotice headline="No stories right now" />;
  }

  return (
    <div style={{ ...shellStyle, overflowY: "auto" }}>
      {articles.map((article, index) => (
        <NewsRow key={article.url ?? `${article.title}:${index}`} article={article} />
      ))}
    </div>
  );
}
