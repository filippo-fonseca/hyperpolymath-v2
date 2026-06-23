"use client";

import type { PersonWithStats } from "@/lib/db/queries/people";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./PersonAvatar";

interface Props {
  person: PersonWithStats;
  onOpen: (person: PersonWithStats) => void;
}

/**
 * Roster card. Glass-tile register matching the training stat cards: serif
 * name, muted email, tag badges, and a mono reference-count stat. The whole
 * tile is the click target into the detail panel.
 */
export function PersonCard({ person, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className={cn(
        "glass-tile rounded-xl p-4 text-left w-full",
        "transition-colors duration-150 hover:border-[var(--edge-hud)]",
        "flex flex-col gap-3 cursor-pointer-always"
      )}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg text-[var(--ink)] truncate">{person.name}</p>
          {person.email ? (
            <p className="font-sans text-sm text-[var(--ink-muted)] truncate">{person.email}</p>
          ) : null}
        </div>
      </div>

      {person.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {person.tags.map((tag) => (
            <span
              key={tag}
              className="font-mono text-[10px] uppercase tracking-[0.06em] rounded-full border border-[var(--edge)] px-2 py-0.5 text-[var(--ink-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
        referenced{" "}
        <span className="tabular-nums text-[var(--hud-cyan)]">{person.referenceCount}</span>{" "}
        {person.referenceCount === 1 ? "time" : "times"}
      </div>
    </button>
  );
}
