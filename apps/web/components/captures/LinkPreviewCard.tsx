"use client";

import type { LinkPreviewRecord } from "@/lib/link-preview/types";
import { cn } from "@/lib/utils";
import { ExternalLink, Play } from "lucide-react";
// Issue #221 — rich link-preview card rendered below a capture's body. Three
// variants: YouTube (thumbnail + play affordance), X/Twitter (persisted tweet
// text + author), and generic (favicon + title + description + optional
// thumbnail). Degrades to a compact favicon+domain chip when metadata is thin or
// still resolving. sd register (sesh-sd3): solid --sd-box plates, --sd-line
// hairlines, no blur/glass, single cyan accent reserved for the app elsewhere.
import { useState } from "react";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Small favicon that hides itself if the image fails to load. */
function Favicon({ src, alt }: { src: string | null; alt: string }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className="h-4 w-4 rounded-sm shrink-0"
    />
  );
}

function Thumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className={className}
    />
  );
}

export function LinkPreviewCard({
  url,
  preview,
}: {
  url: string;
  preview: LinkPreviewRecord | undefined;
}) {
  const host = hostOf(url);
  const open = (e: React.MouseEvent) => e.stopPropagation();

  // No metadata yet (first view) or a failed fetch → compact favicon chip that
  // still links out. Never leaves the user with a dead, contextless string.
  if (!preview || preview.status === "error" || (!preview.title && !preview.imageUrl)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={open}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--sd-line)] bg-[var(--sd-box)] px-2.5 py-1 font-mono text-xs text-[var(--sd-ink)] no-underline transition-colors hover:bg-[var(--sd-hover)]"
      >
        <Favicon src={preview?.faviconUrl ?? null} alt="" />
        <span className="truncate">{preview?.title || host}</span>
        <ExternalLink className="h-3 w-3 text-[var(--sd-ink-faint)] shrink-0" />
      </a>
    );
  }

  if (preview.mediaType === "youtube") {
    const thumb = preview.providerData?.youtubeThumbnailUrl || preview.imageUrl;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={open}
        className="group block max-w-md overflow-hidden rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] no-underline transition-colors hover:bg-[var(--sd-hover)]"
      >
        {thumb && (
          <div className="relative aspect-video w-full border-b border-[var(--sd-line)] bg-[var(--sd-input)]">
            <Thumb
              src={thumb}
              alt={preview.title ?? "YouTube video"}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70">
                <Play className="h-5 w-5 fill-white text-white" />
              </span>
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5 p-2.5">
          <span className="line-clamp-2 text-sm text-[var(--sd-ink)]">{preview.title}</span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--sd-ink-faint)]">
            <Favicon src={preview.faviconUrl} alt="" />
            {preview.providerData?.youtubeChannel || "YouTube"}
          </span>
        </div>
      </a>
    );
  }

  if (preview.mediaType === "twitter") {
    const tweet = preview.providerData?.tweetText || preview.description;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={open}
        className="block max-w-md rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-3 no-underline transition-colors hover:bg-[var(--sd-hover)]"
      >
        <span className="mb-1 flex items-center gap-1.5 font-mono text-xs text-[var(--sd-ink-faint)]">
          <Favicon src={preview.faviconUrl} alt="" />
          {preview.providerData?.tweetAuthor || "X"}
          {preview.providerData?.tweetAuthorHandle && (
            <span className="opacity-70">@{preview.providerData.tweetAuthorHandle}</span>
          )}
        </span>
        {tweet && (
          <p className="whitespace-pre-wrap text-sm text-[var(--sd-ink)]">{tweet}</p>
        )}
      </a>
    );
  }

  // Generic Open Graph card.
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={open}
      className={cn(
        "flex max-w-md items-stretch overflow-hidden rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] no-underline transition-colors hover:bg-[var(--sd-hover)]"
      )}
    >
      {preview.imageUrl && (
        <div className="w-24 shrink-0 border-r border-[var(--sd-line)] bg-[var(--sd-input)]">
          <Thumb src={preview.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--sd-ink-faint)]">
          <Favicon src={preview.faviconUrl} alt="" />
          <span className="truncate">{preview.siteName || host}</span>
        </span>
        <span className="line-clamp-2 text-sm text-[var(--sd-ink)]">
          {preview.title || host}
        </span>
        {preview.description && (
          <span className="line-clamp-2 text-xs text-[var(--sd-ink-faint)]">
            {preview.description}
          </span>
        )}
      </div>
    </a>
  );
}
