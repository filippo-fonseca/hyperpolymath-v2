import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared Spacedrive-register primitives for the settings area.
 *
 * These mirror the sd form grammar shipped by the Jarvis Personality/Startup
 * editors: WidgetCard-v2 section plates (--sd-box, 14px radius, hairline +
 * dark-only inset top highlight), 11px uppercase mono section eyebrows, and
 * --sd-ink typography. Single cyan accent, no glass, no glow, no serif.
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
        "rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-6",
        "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]",
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
        "pl-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-faint)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Card title — the sd widget-card header weight. */
export function CardTitle({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const title = (
    <h3
      className={cn(
        "text-[15px] font-semibold tracking-[-0.01em] text-[var(--sd-ink)]",
        className,
      )}
    >
      {children}
    </h3>
  );
  if (!icon) return title;
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-ink-dull)]">
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
        "text-[13px] leading-[1.5] text-[var(--sd-ink-dull)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
