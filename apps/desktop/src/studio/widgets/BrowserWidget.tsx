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
import { BrowserIcon } from "@hyperpolymath/ui-icons";

import {
  SD_ACCENT,
  SD_DURATION,
  SD_FONT,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
} from "../tokens";
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

/* ── The sd register, hand-rolled ──────────────────────────────────────────
 * No Tailwind in apps/desktop, so the contract's class strings cannot be
 * emitted here; inline style is the sanctioned route (DS §23). These read the
 * tokens.ts TS mirror rather than `var(--sd-*)` because only the debug harness
 * imports sd-tokens.css today — index.html is unit 3's fence — so a `var()`
 * lookup would resolve to nothing in the shipped Tauri app. Same values.
 */

const hairline = `1px solid ${SD_SURFACES.line}`;

/** Chrome verbs take quiet lucide glyphs on ink; the accent is never chrome. */
function IconButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const style: CSSProperties = {
    display: "grid",
    width: 24,
    height: 24,
    flexShrink: 0,
    placeItems: "center",
    padding: 0,
    border: 0,
    borderRadius: SD_RADIUS.chrome,
    color: hovered ? SD_INK.base : SD_INK.faint,
    background: hovered ? SD_SURFACES.hover : "transparent",
    cursor: "pointer",
    transition: `color ${SD_DURATION.micro}ms ease-out, background-color ${SD_DURATION.micro}ms ease-out`,
  };
  const handlers = {
    onPointerEnter: () => setHovered(true),
    onPointerLeave: () => setHovered(false),
  };
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} style={style} {...handlers}>
      {children}
    </a>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} style={style} {...handlers}>
      {children}
    </button>
  );
}

/** The URL bar: a recessed --sd-input field carrying a mono URL, with the
 *  focus ring the register specifies (accent ring struck against the canvas). */
function UrlField({
  draft,
  onDraftChange,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
}): React.ReactElement {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label="Browser URL"
      spellCheck={false}
      style={{
        minWidth: 0,
        height: 24,
        flex: 1,
        padding: "0 8px",
        borderRadius: SD_RADIUS.chrome,
        border: hairline,
        outline: 0,
        color: focused ? SD_INK.base : SD_INK.dull,
        background: SD_SURFACES.input,
        fontFamily: SD_FONT.mono,
        fontSize: 11,
        boxShadow: focused ? `0 0 0 2px ${SD_SURFACES.box}, 0 0 0 3px ${SD_ACCENT}` : "none",
        transition: `color ${SD_DURATION.micro}ms ease-out, box-shadow ${SD_DURATION.micro}ms ease-out`,
      }}
    />
  );
}

function Bookmark({ url }: { url: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["studio", "link-preview", url],
    queryFn: () => loadPreview(url),
    staleTime: 24 * 60 * 60 * 1000,
  });
  if (isLoading) {
    return <div style={{ height: "100%", background: SD_SURFACES.app }} />;
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
      {/* The site's own mark when it has one; otherwise the feature's
          dimensional icon at the §9 empty-state weight (40px, 40% opacity). */}
      {data?.faviconUrl ? (
        <img src={data.faviconUrl} alt="" style={{ width: 32, height: 32 }} />
      ) : (
        <span style={{ opacity: 0.4, lineHeight: 0 }}>
          <BrowserIcon size={40} />
        </span>
      )}
      <div>
        <p
          style={{
            margin: 0,
            color: SD_INK.base,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {data?.title ?? linkDomain(url)}
        </p>
        {data?.description ? (
          <p style={{ margin: "6px 0 0", color: SD_INK.dull, fontSize: 12 }}>
            {data.description}
          </p>
        ) : null}
      </div>
      {/* ActionLink grammar (DS §9): uppercase micro-label, ink-faint → ink.
          It was accent-coloured, and the accent is not chrome (§2). */}
      <ExternalActionLink url={url} />
    </div>
  );
}

function ExternalActionLink({ url }: { url: string }): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: hovered ? SD_INK.base : SD_INK.faint,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textDecoration: "none",
        transition: `color ${SD_DURATION.micro}ms ease-out`,
      }}
    >
      Open externally <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
    </a>
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
        return createNativeWebview(id, url, bounds, SD_RADIUS.card);
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
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        flexDirection: "column",
        color: SD_INK.base,
        // Inner content goes SOLID (sealed D1): the glass belongs to the window
        // chrome around this, not to the content inside it.
        background: SD_SURFACES.box,
        fontFamily: SD_FONT.sans,
      }}
    >
      {/* Chrome bar: the URL sits in a recessed --sd-input field and the bar is
          separated from the page by a hairline, not a border. */}
      <form
        onSubmit={navigate}
        style={{
          display: "flex",
          height: 36,
          flexShrink: 0,
          alignItems: "center",
          gap: 4,
          padding: "0 6px",
          borderBottom: hairline,
        }}
      >
        <UrlField draft={draft} onDraftChange={setDraft} />
        <IconButton label="Reload" onClick={() => setReloadKey((value) => value + 1)}>
          <RotateCw size={12} strokeWidth={1.75} aria-hidden />
        </IconButton>
        <IconButton label="Open externally" href={url}>
          <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
        </IconButton>
      </form>
      <div
        ref={setContentElement}
        data-native-webview-content={id}
        // The page region is recessed one rung below the chrome bar, so the bar
        // reads as chrome over content rather than a stripe on one flat plane.
        style={{
          position: "relative",
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
          background: SD_SURFACES.app,
        }}
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
            style={{ position: "absolute", inset: 0, background: SD_SURFACES.app }}
          />
        ) : (
          <>
            {!loaded ? (
              <div
                style={{ position: "absolute", inset: 0, background: SD_SURFACES.app }}
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
