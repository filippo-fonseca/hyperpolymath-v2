"use client";

import type { PersonWithStats } from "@/lib/db/queries/people";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./PersonAvatar";

interface Props {
  person: PersonWithStats;
  onOpen: (person: PersonWithStats) => void;
}

/**
 * Roster card (jul-29 craft register). A raised white plate on the card idiom:
 * one hairline, the soft card shadow, hover deepening the shadow and pulling
 * the border toward the person's own pastel. The colour lives on the avatar
 * plate and the tag chips, never on the card fill, so a wall of people reads as
 * paper with coloured stickers rather than a wall of pastel.
 *
 * The whole tile is the click target into the detail panel.
 */
export function PersonCard({ person, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className={cn(
        // The person's deterministic hue rides on the card so both the avatar
        // plate and the hover border resolve from the same triple.
        tintFor(person.id),
        "group flex h-full w-full flex-col gap-3 rounded-xl border p-4 text-left",
        "border-[var(--edge)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out cursor-pointer-always",
        "hover:border-[color-mix(in_srgb,var(--tint-edge)_45%,var(--edge))] hover:shadow-[var(--shadow-card-hover)]"
      )}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-subtitle font-medium text-[var(--ink)]">{person.name}</p>
          {person.email ? (
            <p className="mt-0.5 truncate text-meta text-[var(--ink-muted)]">{person.email}</p>
          ) : null}
        </div>
      </div>

      {person.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {person.tags.map((tag) => (
            <PersonTagChip key={tag} tag={tag} />
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-1.5 pt-1 text-micro text-[var(--ink-faint)]">
        {/* A saturated dot in the person's hue: colour on a small accent, per
            the craft rule that fills stay pastel. */}
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-[var(--tint-edge)]"
        />
        Referenced{" "}
        <span className="tabular-nums font-medium text-[var(--ink-muted)]">
          {person.referenceCount}
        </span>{" "}
        {person.referenceCount === 1 ? "time" : "times"}
      </div>
    </button>
  );
}

/**
 * A relationship tag as a pastel chip. The hue is hashed from the tag itself,
 * not the person, so "mentor" is the same colour on every card and the roster
 * reads as a colour-coded taxonomy.
 */
export function PersonTagChip({ tag, className }: { tag: string; className?: string }) {
  return (
    <span
      className={cn(
        tintFor(tag),
        "inline-flex h-[22px] items-center rounded-lg border px-2 text-micro font-medium",
        "border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] text-[var(--tint-ink)]",
        className
      )}
    >
      {tag}
    </span>
  );
}
