import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface InspectorShellProps {
  /** Header title, rendered as a mono uppercase eyebrow. */
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Generic right-hand inspector panel shell. A `--deck-panel` surface with a left
 * hairline, an optional eyebrow header, and a scrollable body. Pair with
 * `MetaSection` / `MetaRow` for labeled metadata inside the body.
 */
export function InspectorShell({ title, children, className }: InspectorShellProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-l border-[var(--deck-line)] bg-[var(--deck-panel)] font-[family-name:var(--font-sans)] text-[13px] text-[var(--deck-ink)]",
        className
      )}
    >
      {title ? (
        <div className="border-b border-[var(--deck-line)] px-4 py-3">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)]">
            {title}
          </span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-2">{children}</div>
    </aside>
  );
}

export interface MetaSectionProps {
  label: string;
  children?: ReactNode;
  className?: string;
}

/**
 * A labeled metadata group with a mono eyebrow header and a `--deck-divider`
 * top hairline separating it from the section above.
 */
export function MetaSection({ label, children, className }: MetaSectionProps) {
  return (
    <section
      className={cn(
        "space-y-1.5 border-t border-[var(--deck-divider)] px-4 py-3 first:border-t-0",
        className
      )}
    >
      <h3 className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)]">
        {label}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export interface MetaRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/**
 * A two-column label / value metadata row. Label in mono `--deck-ink-dull`,
 * value in `--deck-ink`, right-aligned and truncating.
 */
export function MetaRow({ label, value, className }: MetaRowProps) {
  return (
    <div
      className={cn(
        "flex min-h-6 items-center gap-3 text-[12px]",
        className
      )}
    >
      <div className="flex-1 whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--deck-ink-dull)]">
        {label}
      </div>
      <div className="min-w-0 max-w-[140px] truncate text-right text-[var(--deck-ink)]">
        {value}
      </div>
    </div>
  );
}
