"use client";

import type { PersonWithStats } from "@/lib/db/queries/people";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./PersonAvatar";

interface Props {
  person: PersonWithStats;
  onOpen: (person: PersonWithStats) => void;
}

/**
 * Roster card (Spacedrive register). A mini entity card: --sd-box plate with a
 * hairline + dark-only inset top highlight, hover moves the border only. Name in
 * sd ink, muted email, sd chips for tags, and a mono reference-count stat. The
 * whole tile is the click target into the detail panel.
 */
export function PersonCard({ person, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className={cn(
        "flex w-full flex-col gap-3 rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-4 text-left",
        "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]",
        "transition-colors duration-150 ease-out hover:border-[var(--sd-accent)] cursor-pointer-always",
      )}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-[var(--sd-ink)]">
            {person.name}
          </p>
          {person.email ? (
            <p className="truncate text-[13px] text-[var(--sd-ink-dull)]">{person.email}</p>
          ) : null}
        </div>
      </div>

      {person.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {person.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded border border-[var(--sd-line)] bg-[var(--sd-input)] px-1.5 py-[1px] text-tiny font-medium tracking-wide text-[var(--sd-ink-dull)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
        referenced{" "}
        <span className="tabular-nums text-[var(--sd-accent)]">{person.referenceCount}</span>{" "}
        {person.referenceCount === 1 ? "time" : "times"}
      </div>
    </button>
  );
}
