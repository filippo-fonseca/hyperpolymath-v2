import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tint";

/**
 * Shared section primitives for the settings area.
 *
 * jul-29 craft restyle: the plates moved off the flat --sd-box register onto
 * the app's card idiom — a raised white surface, one --edge hairline, the
 * --shadow-card lift, 14px radius. They deliberately spell that idiom out in
 * utilities rather than reaching for the unlayered `.craft-card` class, because
 * `.craft-card` would win over any `className` a caller passes (the account
 * page tints its delete plate coral, for one). Utilities go through
 * tailwind-merge, so the last class named still wins.
 *
 * Eyebrows and body copy keep the mono/uppercase settings voice.
 */

export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] p-6",
        "shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** 11px uppercase mono eyebrow that labels a settings section on the canvas. */
export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "pl-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/**
 * Card title. When an `icon` is supplied it rides a small pastel plate whose
 * hue is derived from the title itself, so a section keeps the same colour on
 * every visit without anyone maintaining a colour table.
 */
export function CardTitle({
  children,
  icon,
  tintKey,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  /** Hue seed when the title is not a plain string. Defaults to the title. */
  tintKey?: string;
  className?: string;
}) {
  const title = (
    <h3
      className={cn(
        "text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink)]",
        className,
      )}
    >
      {children}
    </h3>
  );
  if (!icon) return title;
  const seed = tintKey ?? (typeof children === "string" ? children : "settings");
  return (
    <div className={cn("flex items-center gap-3", tintFor(seed))}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tint-bg)] text-[var(--tint-ink)]">
        {icon}
      </span>
      {title}
    </div>
  );
}

/** Muted supporting copy under a card title. */
export function CardDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[13px] leading-[1.5] text-[var(--ink-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
