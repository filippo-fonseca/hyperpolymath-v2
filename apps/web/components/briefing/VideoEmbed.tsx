"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * A lightweight YouTube facade: renders the real thumbnail with a play badge
 * and only swaps in the (heavy) iframe once the user clicks. Keeps the briefing
 * fast — no autoplaying embeds, no widget scripts loading up front.
 */
export function VideoEmbed({
  embedUrl,
  thumbUrl,
  title,
}: {
  embedUrl: string;
  thumbUrl: string;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="craft-card relative mt-3 aspect-video w-full overflow-hidden">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`${embedUrl}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full cursor-pointer"
          aria-label={`Play video: ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/10" />
          <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play size={22} strokeWidth={2} className="ml-0.5 fill-white text-white" />
          </span>
        </button>
      )}
    </div>
  );
}
