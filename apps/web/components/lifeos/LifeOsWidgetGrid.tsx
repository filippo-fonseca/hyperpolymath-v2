import type { ReactNode } from "react";

/**
 * LifeOsWidgetGrid — responsive wrapper for the at-a-glance tiles.
 *
 * 3-col on lg+ (the page's 1280px width carries three quiet cards
 * comfortably), 2-col on md (tablet half-width), single column under md.
 * Widget cards already have `h-full` on their root <section> so they
 * align flush at the bottom inside the grid without extra plumbing.
 */
export function LifeOsWidgetGrid({ children }: { children: ReactNode }) {
  return (
    <section className="mb-12">
      <header className="mb-4 flex items-baseline">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
          At a glance
        </h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  );
}
