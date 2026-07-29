"use client";

import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { personInitials } from "./initials";

interface Props {
  name: string;
  avatarUrl: string | null;
  /**
   * The person's id. Supplying it gives the plate that person's deterministic
   * pastel (jul-29 craft restyle) — same hue on the roster card, the detail
   * header and the edit dialog. Omit it and the plate falls back to the
   * neutral hover fill, or inherits a `tint-*` set by an ancestor.
   */
  personId?: string | null;
  /** Tailwind size classes for the plate, e.g. "size-12". */
  sizeClass?: string;
  /** Tailwind text-size class for the initials, e.g. "text-base". */
  textClass?: string;
  /** Corner radius. Craft plates are rounded squares, not circles. */
  radiusClass?: string;
  className?: string;
}

/**
 * Person plate — a tinted rounded square that prefers the uploaded image and
 * falls back to initials in the tint's in-family ink when there is no URL or
 * the remote image fails to load.
 *
 * jul-29 craft restyle: identity is colour. The plate reads as the pastel
 * icon-plate used across areas and projects (`bg-[var(--tint-bg)]` /
 * `text-[var(--tint-ink)]` under a `tint-*` ancestor), so a person is
 * recognisable by hue before the name is read.
 */
export function PersonAvatar({
  name,
  avatarUrl,
  personId,
  sizeClass = "size-12",
  textClass = "text-base",
  radiusClass = "rounded-xl",
  className,
}: Props) {
  const [broken, setBroken] = useState(false);
  const showImage = avatarUrl && !broken;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border",
        // Only claim a hue when given an id; otherwise inherit an ancestor's
        // tint, or fall through to the neutral fallbacks below.
        personId ? tintFor(personId) : undefined,
        "border-[color-mix(in_srgb,var(--tint-edge,var(--edge))_40%,transparent)]",
        "bg-[var(--tint-bg,var(--hover))]",
        radiusClass,
        sizeClass,
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className={cn(
            "font-medium text-[var(--tint-ink,var(--ink-muted))]",
            textClass
          )}
        >
          {personInitials(name)}
        </span>
      )}
    </span>
  );
}
