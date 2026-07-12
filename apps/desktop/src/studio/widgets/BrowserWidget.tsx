import * as React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RotateCw } from "lucide-react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { studioFetch } from "../studio-fetch";
import type { WidgetContentProps } from "../windows/catalog";
import {
  createNativeWebview,
  destroyNativeWebview,
  navigateNativeWebview,
  physicalWebviewBounds,
  useNativeWebviewSync,
} from "../windows/native-webview";
import { subscribeWidgetWindows, updateWidgetProps } from "../state/widget-windows";
import {
  classifyLinkEmbed,
  linkDomain,
  normalizeBrowserUrl,
  twitterStatusId,
} from "../windows/browser-embed";

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
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const [contentRect, setContentRect] = useState<DOMRectReadOnly | null>(null);
  const [nativeStatus, setNativeStatus] = useState<
    "idle" | "creating" | "active" | "failed"
  >("idle");
  const loadedRef = useRef(false);
  const nativeGeneration = useRef(0);
  const classification = classifyLinkEmbed(url);
  const tweetId =
    classification.mediaType === "twitter" ? twitterStatusId(url) : null;
  // Real websites almost universally block iframing via X-Frame-Options or CSP
  // frame-ancestors (bbc.com, google.com, news sites, etc.). A blocked frame
  // still fires `onLoad` on WebKit, which cancels the 4s timeout below, so the
  // iframe path silently strands the widget on a permanent white page. Only
  // youtube/twitter have purpose-built embed iframes that reliably frame; every
  // other (generic) page must render through the native child webview.
  const isGeneric = classification.mediaType === "generic";
  const shouldPromote = isGeneric || timedOut;
  const contentReady = contentRect !== null;
  const invalidTweet = classification.mediaType === "twitter" && !tweetId;
  const fallback = invalidTweet || (shouldPromote && nativeStatus === "failed");

  const measureContent = useCallback(() => {
    if (!contentElement) return;
    const next = contentElement.getBoundingClientRect();
    setContentRect((current) =>
      current &&
      current.left === next.left &&
      current.top === next.top &&
      current.width === next.width &&
      current.height === next.height
        ? current
        : next,
    );
  }, [contentElement]);

  useLayoutEffect(() => {
    if (!contentElement) return;
    let animationFrame = 0;
    const scheduleMeasure = (): void => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measureContent);
    };
    measureContent();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(contentElement);
    const unsubscribe = subscribeWidgetWindows(scheduleMeasure);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [contentElement, measureContent]);

  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    setTimedOut(false);
    // Generic pages promote to the native webview immediately (see above), so no
    // iframe-load timeout is needed. Only the embed iframes (youtube/twitter)
    // rely on the fallback timeout.
    if (isGeneric) return;
    const timer = window.setTimeout(() => {
      if (!loadedRef.current) setTimedOut(true);
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [url, reloadKey, isGeneric]);

  useEffect(() => {
    if (!shouldPromote || !contentRect) {
      setNativeStatus("idle");
      return;
    }
    const generation = ++nativeGeneration.current;
    setNativeStatus("creating");
    const creation = physicalWebviewBounds(contentRect)
      .then((bounds) => {
        console.warn(
          `[BrowserWidget] promoting ${id} url=${url} bounds`,
          bounds,
        );
        return createNativeWebview(id, url, bounds);
      })
      .then(() => {
        if (nativeGeneration.current === generation) setNativeStatus("active");
      })
      .catch((error) => {
        console.warn(`[BrowserWidget] native promotion failed ${id}:`, error);
        if (nativeGeneration.current === generation) {
          void destroyNativeWebview(id).catch(() => undefined);
          setNativeStatus("failed");
        }
      });
    return () => {
      const cleanupGeneration = ++nativeGeneration.current;
      void creation.finally(() => {
        queueMicrotask(() => {
          if (nativeGeneration.current === cleanupGeneration) {
            void destroyNativeWebview(id).catch(() => undefined);
          }
        });
      });
    };
  }, [id, shouldPromote, contentReady]);

  useEffect(() => {
    if (nativeStatus !== "active" || !shouldPromote) return;
    void navigateNativeWebview(id, url).catch((error) => {
      console.warn(`[BrowserWidget] native navigate failed ${id}:`, error);
      void destroyNativeWebview(id).catch(() => undefined);
      setNativeStatus("failed");
    });
  }, [id, nativeStatus, reloadKey, shouldPromote, url]);

  useNativeWebviewSync(id, contentRect, nativeStatus === "active");

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
      <div
        ref={setContentElement}
        data-native-webview-content={id}
        style={{ position: "relative", minHeight: 0, flex: 1, overflow: "hidden" }}
      >
        {fallback ? (
          <Bookmark url={url} />
        ) : shouldPromote ? (
          <div
            aria-label={
              nativeStatus === "active"
                ? "Native website content"
                : "Opening website"
            }
            // When the child webview is live the hand-scroll path must route to
            // the `studio_webview_scroll` IPC, not a DOM WheelEvent — the OS
            // webview is not in this document. This marker (present only while
            // active) lets pointer-synth pick the native path.
            {...(nativeStatus === "active" ? { "data-native-webview-active": id } : {})}
            style={{ position: "absolute", inset: 0, background: STUDIO_COLORS.surface }}
          />
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
              onLoad={() => {
                loadedRef.current = true;
                setLoaded(true);
              }}
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
