"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { personInitials } from "./initials";

interface Props {
  name: string;
  avatarUrl: string | null;
  /** Tailwind size classes for the circle, e.g. "w-12 h-12". */
  sizeClass?: string;
  /** Tailwind text-size class for the initials, e.g. "text-base". */
  textClass?: string;
  className?: string;
}

/**
 * Rounded avatar that prefers the uploaded image and falls back to serif
 * initials when there is no URL or the remote image fails to load.
 */
export function PersonAvatar({
  name,
  avatarUrl,
  sizeClass = "w-12 h-12",
  textClass = "text-base",
  className,
}: Props) {
  const [broken, setBroken] = useState(false);
  const showImage = avatarUrl && !broken;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full overflow-hidden border border-[var(--edge)] bg-[var(--surface)] flex items-center justify-center",
        sizeClass,
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={cn("font-serif text-[var(--ink-muted)]", textClass)}>
          {personInitials(name)}
        </span>
      )}
    </span>
  );
}
