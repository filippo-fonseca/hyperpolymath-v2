"use client";

/**
 * RIGHT SLOT — track three of the cockpit (SDC-1 §2.2).
 *
 * One track, two possible occupants: the Dock by default, a `SidePanel` when
 * one opens. Never both, and never a fourth column. Right now the track exists
 * and is zero-wide; the panel host moves in next, the Dock after it.
 */
export function RightSlot() {
  return <div className="min-w-0 overflow-hidden" />;
}
