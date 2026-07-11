import * as React from "react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RotateCw } from "lucide-react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { studioFetch } from "../studio-fetch";
import type { WidgetContentProps } from "../windows/catalog";
import {
  classifyLinkEmbed,
  isKnownFrameBlocker,
  linkDomain,
  normalizeBrowserUrl,
  twitterStatusId,
} from "../windows/browser-embed";
import { updateWidgetProps } from "../state/widget-windows";

interface LinkPreviewResult {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
}

async function loadPreview(url: string): Promise<LinkPreviewResult> {
  const response = await studioFetch("/api/studio/link-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error("Preview unavailable");
  return response.json() as Promise<LinkPreviewResult>;
}

const iconButtonStyle: CSSProperties = {
  display: "grid",
  width: 24,
  height: 24,
  flexShrink: 0,
  placeItems: "center",
  padding: 0,
  border: 0,
  color: STUDIO_COLORS.muted,
  background: "transparent",
  cursor: "pointer",
};

function Bookmark({ url }: { url: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["studio", "link-preview", url],
    queryFn: () => loadPreview(url),
    staleTime: 24 * 60 * 60 * 1000,
  });
  if (isLoading) {
    return <div style={{ height: "100%", background: STUDIO_COLORS.surface }} />;
  }
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      {data?.faviconUrl ? (
        <img src={data.faviconUrl} alt="" style={{ width: 32, height: 32 }} />
      ) : null}
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          {data?.title ?? linkDomain(url)}
        </p>
        {data?.description ? (
          <p style={{ margin: "6px 0 0", color: STUDIO_COLORS.muted, fontSize: 12 }}>
            {data.description}
          </p>
        ) : null}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ color: STUDIO_COLORS.accent, fontFamily: STUDIO_MONO, fontSize: 10 }}
      >
        Open externally <ExternalLink size={11} aria-hidden />
      </a>
    </div>
  );
}

export default function BrowserWidget({
  id,
  props,
}: WidgetContentProps): React.ReactElement {
  const initial =
    typeof props.url === "string" ? normalizeBrowserUrl(props.url) : null;
  const [url, setUrl] = useState(initial ?? "https://example.com/");
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const classification = classifyLinkEmbed(url);
  const tweetId =
    classification.mediaType === "twitter" ? twitterStatusId(url) : null;
  const knownBlocker =
    classification.mediaType === "generic" && isKnownFrameBlocker(url);
  const fallback =
    knownBlocker ||
    timedOut ||
    (classification.mediaType === "twitter" && !tweetId);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    if (knownBlocker) return;
    const timer = window.setTimeout(
      () => setTimedOut((value) => value || !loaded),
      4_000,
    );
    return () => window.clearTimeout(timer);
  }, [url, reloadKey, knownBlocker, loaded]);

  const navigate = (event: FormEvent): void => {
    event.preventDefault();
    const next = normalizeBrowserUrl(draft);
    if (!next) return;
    setUrl(next);
    setDraft(next);
    updateWidgetProps(id, { url: next });
  };

  let src = url;
  if (classification.mediaType === "youtube" && classification.youtubeId) {
    src = `https://www.youtube-nocookie.com/embed/${classification.youtubeId}`;
  } else if (classification.mediaType === "twitter" && tweetId) {
    src = `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true`;
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}>
      <form
        onSubmit={navigate}
        style={{
          display: "flex",
          height: 36,
          flexShrink: 0,
          alignItems: "center",
          gap: 4,
          padding: "0 8px",
          borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Browser URL"
          style={{
            minWidth: 0,
            flex: 1,
            border: 0,
            outline: 0,
            color: STUDIO_COLORS.muted,
            background: "transparent",
            fontFamily: STUDIO_MONO,
            fontSize: 10,
          }}
        />
        <button
          type="button"
          aria-label="Reload"
          onClick={() => setReloadKey((value) => value + 1)}
          style={iconButtonStyle}
        >
          <RotateCw size={12} aria-hidden />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open externally"
          style={iconButtonStyle}
        >
          <ExternalLink size={12} aria-hidden />
        </a>
      </form>
      <div style={{ position: "relative", minHeight: 0, flex: 1, overflow: "hidden" }}>
        {fallback ? (
          <Bookmark url={url} />
        ) : (
          <>
            {!loaded ? (
              <div
                style={{ position: "absolute", inset: 0, background: STUDIO_COLORS.surface }}
              />
            ) : null}
            <iframe
              key={`${src}:${reloadKey}`}
              src={src}
              title={linkDomain(url)}
              onLoad={() => setLoaded(true)}
              style={{ width: "100%", height: "100%", border: 0, background: "transparent" }}
              sandbox={
                classification.mediaType === "generic"
                  ? "allow-scripts allow-same-origin allow-forms allow-popups"
                  : undefined
              }
              referrerPolicy="no-referrer"
              allow={
                classification.mediaType === "youtube"
                  ? "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
