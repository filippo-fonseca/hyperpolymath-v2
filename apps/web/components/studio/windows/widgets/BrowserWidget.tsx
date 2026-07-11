"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RotateCw } from "lucide-react";
import { STUDIOLO } from "../../materials/tokens";
import type { WidgetContentProps } from "@/lib/studio/windows/catalog";
import { classifyLinkEmbed, linkDomain } from "@/lib/pages/link-embed";
import type { LinkPreviewResult } from "@/lib/link-preview/types";
import {
  isKnownFrameBlocker,
  normalizeBrowserUrl,
  twitterStatusId,
} from "@/lib/studio/windows/browser-embed";
import { updateWidgetProps } from "@/lib/studio/state/widget-windows";

async function loadPreview(url: string): Promise<LinkPreviewResult> {
  const response = await fetch("/api/studio/link-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error("Preview unavailable");
  return response.json() as Promise<LinkPreviewResult>;
}

function Bookmark({ url }: { url: string }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["studio", "link-preview", url],
    queryFn: () => loadPreview(url),
    staleTime: 24 * 60 * 60 * 1000,
  });
  if (isLoading) {
    return <div className="h-full animate-pulse" style={{ background: `color-mix(in srgb, ${STUDIOLO.moonlace} 9%, transparent)` }} />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {data?.faviconUrl ? <img src={data.faviconUrl} alt="" className="h-8 w-8 rounded-md" /> : null}
      <div>
        <p className="line-clamp-2 text-sm font-medium">{data?.title ?? linkDomain(url)}</p>
        {data?.description ? <p className="mt-1 line-clamp-3 text-xs" style={{ color: STUDIOLO.moonlace }}>{data.description}</p> : null}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider"
        style={{ color: STUDIOLO.jarvisCyan, borderColor: `color-mix(in srgb, ${STUDIOLO.jarvisCyan} 38%, transparent)` }}
      >
        Open <ExternalLink size={11} />
      </a>
    </div>
  );
}

export default function BrowserWidget({ id, props }: WidgetContentProps): React.ReactElement {
  const initial = typeof props.url === "string" ? normalizeBrowserUrl(props.url) : null;
  const [url, setUrl] = useState(initial ?? "https://example.com/");
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const classification = classifyLinkEmbed(url);
  const tweetId = classification.mediaType === "twitter" ? twitterStatusId(url) : null;
  const knownBlocker = classification.mediaType === "generic" && isKnownFrameBlocker(url);
  const fallback = knownBlocker || timedOut || (classification.mediaType === "twitter" && !tweetId);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    if (knownBlocker) return;
    const timer = window.setTimeout(() => setTimedOut((value) => value || !loaded), 4_000);
    return () => window.clearTimeout(timer);
  }, [url, reloadKey, knownBlocker, loaded]);

  const navigate = (event: React.FormEvent): void => {
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
    <div className="flex h-full min-h-0 flex-col">
      <form
        onSubmit={navigate}
        className="flex h-9 shrink-0 items-center gap-1 border-b px-2"
        style={{ borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 16%, transparent)` }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Browser URL"
          className="min-w-0 flex-1 bg-transparent font-mono text-[10px] outline-none"
          style={{ color: STUDIOLO.moonlace }}
        />
        <button type="button" aria-label="Reload" onClick={() => setReloadKey((value) => value + 1)} className="p-1"><RotateCw size={12} /></button>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Open externally" className="p-1"><ExternalLink size={12} /></a>
      </form>
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${STUDIOLO.parchment} 12%, transparent)` }}
      >
        {fallback ? <Bookmark url={url} /> : (
          <>
            {!loaded ? <div className="absolute inset-0 animate-pulse" style={{ background: `color-mix(in srgb, ${STUDIOLO.moonlace} 9%, ${STUDIOLO.deepVellum})` }} /> : null}
            <iframe
              key={`${src}:${reloadKey}`}
              src={src}
              title={linkDomain(url)}
              onLoad={() => setLoaded(true)}
              className="h-full w-full border-0 bg-transparent"
              sandbox={classification.mediaType === "generic" ? "allow-scripts allow-same-origin allow-forms allow-popups" : undefined}
              referrerPolicy="no-referrer"
              allow={classification.mediaType === "youtube" ? "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
