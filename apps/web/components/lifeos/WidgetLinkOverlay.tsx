import Link from "next/link";

/**
 * Stretched-link overlay for LifeOS widget cards. Renders an absolutely
 * positioned Link covering the whole card so the user can click anywhere
 * on the tile background to navigate to the underlying surface.
 *
 * Place this as the FIRST child inside a `<section className={WIDGET_CARD_CLASS}>`
 * (after the WIDGET_GLOW span if present). Inner interactive elements should
 * be wrapped in a sibling div that uses `lifeos-widget-content` so background
 * clicks fall through to this overlay while real controls still receive
 * their events. See `LifeOsWidgetGrid.tsx` for the class definition.
 */
export function WidgetLinkOverlay({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      tabIndex={-1}
      className="absolute inset-0 z-0 cursor-pointer"
    />
  );
}
