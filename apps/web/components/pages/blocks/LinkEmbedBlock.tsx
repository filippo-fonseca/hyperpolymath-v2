"use client";

import type { LinkPreviewResult } from "@/lib/link-preview/types";
import { classifyLinkEmbed, linkDomain, type LinkEmbedVariant } from "@/lib/pages/link-embed";
import { createReactBlockSpec } from "@blocknote/react";
import { ExternalLink, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface LinkEmbedProps {
  url: string;
  variant: LinkEmbedVariant;
  title: string;
  description: string;
  imageUrl: string;
  faviconUrl: string;
  mediaType: "generic" | "youtube" | "twitter";
}

export const EMPTY_LINK_EMBED_PROPS: LinkEmbedProps = {
  url: "",
  variant: "bookmark",
  title: "",
  description: "",
  imageUrl: "",
  faviconUrl: "",
  mediaType: "generic",
};

export async function resolveLinkEmbed(
  url: string,
  variant: LinkEmbedVariant
): Promise<LinkEmbedProps> {
  try {
    const response = await fetch("/api/wiki/link-embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) throw new Error("Preview request failed");
    const preview = (await response.json()) as LinkPreviewResult;
    if (preview.status !== "ok") throw new Error(preview.error ?? "Preview request failed");
    return {
      url: preview.url,
      variant,
      title: preview.title ?? linkDomain(preview.url),
      description: preview.description ?? "",
      imageUrl: preview.imageUrl ?? "",
      faviconUrl: preview.faviconUrl ?? "",
      mediaType: preview.mediaType,
    };
  } catch {
    return { ...EMPTY_LINK_EMBED_PROPS, url, variant, title: url };
  }
}

export const linkEmbedBlock = createReactBlockSpec(
  {
    type: "linkEmbed",
    content: "none",
    propSchema: {
      url: { default: "" },
      variant: { default: "bookmark", values: ["bookmark", "embed"] as const },
      title: { default: "" },
      description: { default: "" },
      imageUrl: { default: "" },
      faviconUrl: { default: "" },
      mediaType: { default: "generic", values: ["generic", "youtube", "twitter"] as const },
    },
  },
  {
    render: ({ block, editor }) => (
      <LinkEmbedRenderer
        props={block.props}
        onResolve={(props) => editor.updateBlock(block.id, { props })}
      />
    ),
  }
)();

function LinkEmbedRenderer({
  props,
  onResolve,
}: {
  props: LinkEmbedProps;
  onResolve: (props: LinkEmbedProps) => void;
}) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (!props.url) {
    return (
      <form
        className="bn-link-embed-input"
        contentEditable={false}
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = url.trim();
          if (!/^https?:\/\//i.test(normalized) || submitting) return;
          setSubmitting(true);
          onResolve({ ...EMPTY_LINK_EMBED_PROPS, url: normalized, variant: props.variant });
          void resolveLinkEmbed(normalized, props.variant).then(onResolve);
        }}
      >
        <Link2 size={15} aria-hidden />
        <input
          autoFocus
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={props.variant === "embed" ? "Paste an embed URL…" : "Paste a bookmark URL…"}
          aria-label="Link URL"
        />
        <button type="submit" disabled={submitting}>
          Add
        </button>
      </form>
    );
  }

  const loading = !props.title && !props.description && !props.imageUrl && !props.faviconUrl;
  if (loading) return <LinkEmbedSkeleton />;
  if (props.title === props.url && !props.description && !props.imageUrl) {
    return <PlainLink url={props.url} />;
  }
  if (props.variant === "bookmark") return <BookmarkCard props={props} />;
  if (props.mediaType === "youtube") return <YouTubeEmbed props={props} />;
  if (props.mediaType === "twitter") return <FramedEmbed props={props} twitter />;
  return <FramedEmbed props={props} />;
}

function LinkEmbedSkeleton() {
  return (
    <div
      className="bn-link-embed-skeleton"
      aria-label="Loading link preview"
      contentEditable={false}
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function PlainLink({ url }: { url: string }) {
  return (
    <a
      className="bn-link-embed-plain"
      href={url}
      target="_blank"
      rel="noreferrer"
      contentEditable={false}
    >
      <Link2 size={14} aria-hidden /> {url}
    </a>
  );
}

function BookmarkCard({ props }: { props: LinkEmbedProps }) {
  return (
    <a
      className="bn-link-bookmark"
      href={props.url}
      target="_blank"
      rel="noreferrer"
      contentEditable={false}
    >
      <span className="bn-link-bookmark-copy">
        <strong>{props.title || linkDomain(props.url)}</strong>
        {props.description ? (
          <span className="bn-link-bookmark-description">{props.description}</span>
        ) : null}
        <span className="bn-link-bookmark-domain">
          {props.faviconUrl ? (
            <img src={props.faviconUrl} alt="" />
          ) : (
            <Link2 size={14} aria-hidden />
          )}
          {linkDomain(props.url)}
        </span>
      </span>
      {props.imageUrl ? (
        <img className="bn-link-bookmark-image" src={props.imageUrl} alt="" />
      ) : null}
    </a>
  );
}

function YouTubeEmbed({ props }: { props: LinkEmbedProps }) {
  const videoId = classifyLinkEmbed(props.url).youtubeId;
  if (!videoId) return <BookmarkCard props={props} />;
  return (
    <div className="bn-link-embed-frame bn-link-embed-youtube" contentEditable={false}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={props.title || "YouTube video"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function FramedEmbed({ props, twitter = false }: { props: LinkEmbedProps; twitter?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!loaded) setFailed(true);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [loaded]);
  if (failed) return <BookmarkCard props={props} />;
  const src = twitter
    ? `https://twitframe.com/show?url=${encodeURIComponent(props.url)}`
    : props.url;
  return (
    <figure
      className={`bn-link-embed-frame${twitter ? " bn-link-embed-twitter" : ""}`}
      contentEditable={false}
    >
      <iframe
        src={src}
        title={props.title || linkDomain(props.url)}
        loading="lazy"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      <figcaption>
        {linkDomain(props.url)}
        <a href={props.url} target="_blank" rel="noreferrer">
          open <ExternalLink size={11} />
        </a>
      </figcaption>
    </figure>
  );
}
