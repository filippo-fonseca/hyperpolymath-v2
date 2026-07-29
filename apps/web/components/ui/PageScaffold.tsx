import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * PageScaffold — the one page container (SDC-1 §2.9).
 *
 * It replaces the six ad-hoc containers the repo grew (`px-8 py-10`,
 * `px-6 pt-5`, `max-w-[1080px]`, `[920px]`, `[720px]`, `[760px]`, `[960px]`,
 * `[1200px]`), which is why left edges never lined up between routes. One
 * measure, one gutter, one header rhythm, everywhere.
 *
 * The anatomy is fixed. Do not add props that vary spacing: the whole point is
 * that five parallel units produce one app rather than five. It is centred
 * **within the stage**, not within the viewport, so it stays honest when the
 * cockpit's right slot opens and the stage reflows.
 *
 * This file is U0-owned and frozen for wave 2. If it cannot express a page you
 * need, that is a blocker for U0, not an edit.
 *
 * ```tsx
 * <PageScaffold
 *   eyebrow="Areas"
 *   icon={<AreaIcon />}
 *   title="Orthopaedics"
 *   subtitle="Implant materials and local antibiotic delivery."
 *   meta={<PageScaffold.MetaRow>{["4 projects", "12 tasks"]}</PageScaffold.MetaRow>}
 *   actions={<Button>New project</Button>}
 * >
 *   <PageScaffold.Section title="Projects">…</PageScaffold.Section>
 * </PageScaffold>
 * ```
 */

type PageScaffoldProps = {
  /** Sentence case breadcrumb or parent area. `text-micro` in --ink-faint. */
  eyebrow?: ReactNode;
  /**
   * 28px dimensional icon (nouns only), sitting in a `size-8` optical box.
   * Renders on its own row above the title (F3 adjudication of §2.9): the H1
   * TEXT left edge is the cross-route invariant, so the icon must never
   * displace it.
   */
  icon?: ReactNode;
  title: ReactNode;
  /** One line. `text-meta`. */
  subtitle?: ReactNode;
  /** A `<PageScaffold.MetaRow>`. */
  meta?: ReactNode;
  /** Right-aligned. AT MOST ONE primary Button; everything else ghost or icon. */
  actions?: ReactNode;
  /** `<PageScaffold.Section>` blocks. */
  children?: ReactNode;
  className?: string;
};

function PageScaffoldRoot({
  eyebrow,
  icon,
  title,
  subtitle,
  meta,
  actions,
  children,
  className,
}: PageScaffoldProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[1120px] px-8 pt-10 pb-24", className)}>
      {/* The header block has no border and no background. It sits on the
          canvas; the first hairline on a page is the first section divider. */}
      <header>
        {eyebrow ? (
          <p className="mb-2 text-micro font-medium text-[var(--ink-faint)]">{eyebrow}</p>
        ) : null}

        {/* The icon sits on its own row so it never displaces the H1 text:
            the H1 TEXT left edge is what must be visually equal across every
            route (F3 adjudication of §2.9). */}
        {icon ? (
          <span aria-hidden className="mb-2 flex size-8 shrink-0 items-center justify-center">
            {icon}
          </span>
        ) : null}

        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-display font-semibold text-[var(--ink)]">{title}</h1>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>

        {subtitle ? (
          <p className="mt-2 max-w-[68ch] text-meta text-[var(--ink-muted)]">{subtitle}</p>
        ) : null}

        {meta ? <div className="mt-3">{meta}</div> : null}
      </header>

      {children}
    </div>
  );
}

/**
 * MetaRow — plain-text meta separated by a faint `·`. Values are plain text;
 * only status uses `StatusPill` from `components/lifeos/entity-card.tsx`. Never
 * a chip, never a border, never a bordered plate around the row.
 *
 * Pass items as an array of nodes; the separators are inserted for you so every
 * page spaces and colours them identically.
 */
function MetaRow({
  children,
  className,
}: {
  children: ReactNode[];
  className?: string;
}) {
  const items = children.filter((item) => item !== null && item !== undefined && item !== false);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-[var(--ink-muted)]",
        className
      )}
    >
      {items.map((item, index) => (
        // Meta items are positional and have no stable identity of their own;
        // the index is the identity. The list is static per render.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional by design
        <span key={index} className="flex items-center gap-x-4">
          {index > 0 ? (
            <span aria-hidden className="text-[var(--ink-faint)]">
              ·
            </span>
          ) : null}
          {item}
        </span>
      ))}
    </div>
  );
}

/**
 * Section — 32px of rhythm between page sections, an optional `text-title`
 * heading, and an optional top hairline for pages with three or more sections.
 * Section content owns its own internal layout.
 */
function Section({
  title,
  action,
  divided = false,
  children,
  className,
}: {
  title?: ReactNode;
  /** Right-aligned control for this section (a ghost button, a toggle). */
  action?: ReactNode;
  /** Opt in to a `border-t` hairline. Use when a page has three or more sections. */
  divided?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-8", divided && "border-t border-[var(--edge)] pt-8", className)}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-4">
          {title ? (
            <h2 className="text-title font-semibold text-[var(--ink)]">{title}</h2>
          ) : (
            <span />
          )}
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export const PageScaffold = Object.assign(PageScaffoldRoot, {
  MetaRow,
  Section,
});
