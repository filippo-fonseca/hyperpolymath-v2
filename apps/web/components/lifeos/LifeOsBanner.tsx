/**
 * LifeOsBanner — Notion-style page header.
 *
 * Composition mirrors a Notion page: a quiet cover strip up top, then an
 * oversized emoji glyph, then a serif H1 and optional italic subtitle. The
 * cover gradient pulls --hud-cyan in at very low alpha — a whisper of the
 * JARVIS atmosphere without resorting to HUD chrome. This honors the
 * "JARVIS as MOOD only" guidance: cyan is present but the surface still
 * reads as a journal page, not a dashboard.
 *
 * Presentational only. Server-safe (no client hooks).
 */
interface Props {
  title: string;
  emoji: string;
  subtitle?: string;
}

export function LifeOsBanner({ title, emoji, subtitle }: Props) {
  return (
    <section className="mb-10">
      {/* Cover placeholder — Notion-style strip. Static for now; a future
          plan can wire image upload + crop. The very low-alpha cyan tint
          in the gradient is the only atmospheric touch on this surface. */}
      <div
        aria-hidden="true"
        className="h-24 md:h-32 rounded-lg border border-[var(--edge)] bg-[var(--surface)] mb-6"
        style={{
          background:
            "linear-gradient(135deg, var(--surface) 0%, color-mix(in oklch, var(--hud-cyan) 4%, var(--surface)) 100%)",
        }}
      />
      {/* Emoji + title block — mirrors Notion's page header proportions.
          Using a lozenge glyph (◈) instead of a standard emoji to stay in
          the Renaissance/journal-paper register; `📓` was the considered
          alternative but lozenge fits the rest of the surface better. */}
      <div className="space-y-3">
        <div className="text-5xl leading-none select-none" aria-hidden="true">
          {emoji}
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
