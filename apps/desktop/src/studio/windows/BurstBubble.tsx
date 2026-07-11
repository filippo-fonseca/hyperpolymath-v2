import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { STUDIO_COLORS } from "../tokens";
import { BURST_THRESHOLD } from "./edge-burst";

const CYAN = STUDIO_COLORS.accent;

interface Props {
  /** Burst progress 0..1 for the widget currently arming this bubble. */
  progress: number;
  /** Set true for the pop flash, then unmount the whole overlay. */
  popping: boolean;
  /** Outward unit vector (through the nearest border) for the scatter fling. */
  direction: { x: number; y: number };
}

// Eight shards scattered around the ring — the pop's particle burst. Angles are
// pre-baked so the render stays allocation-light; each rides the outward fling
// plus its own radial offset.
const SHARDS = Array.from({ length: 8 }, (_, index) => {
  const angle = (index / 8) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

/**
 * The "about to burst" bubble. It sits over the dragged widget: a translucent
 * cyan skin that swells with `progress` and, as it nears the commit threshold,
 * tautens and wobbles ("about to burst" warning). On `popping` it flashes and
 * scatters shards. Transforms + opacity only — no blur/filter churn.
 */
export function BurstBubble({
  progress,
  popping,
  direction,
}: Props): React.ReactElement {
  const reduced = useReducedMotion();
  // Skin swell: subtle at the zone edge, taut near the threshold.
  const swell = 1 + progress * 0.14;
  // Tautness/opacity climb with progress; the ring brightens as it warns.
  const skinOpacity = 0.1 + progress * 0.34;
  const ringOpacity = 0.25 + progress * 0.55;
  // Wobble amplitude ramps in only in the top third — the last-chance warning.
  const near = Math.max(0, (progress - BURST_THRESHOLD + 0.18) / 0.36);
  const wobble = reduced ? 0 : Math.min(1, near) * 0.05;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        // Ride above the widget's own content while it deflates into the skin.
        zIndex: 2,
      }}
    >
      <AnimatePresence>
        {popping ? (
          <React.Fragment key="pop">
            {/* Scale-flash: a quick bright ring blowing outward. */}
            <motion.div
              style={popStyle}
              initial={{ opacity: 0.9, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.9 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
            />
            {SHARDS.map((shard, index) => (
              <motion.span
                key={`shard:${index}`}
                style={shardStyle}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: 0,
                  scale: 0.4,
                  x: (shard.x + direction.x * 1.1) * 78,
                  y: (shard.y + direction.y * 1.1) * 78,
                }}
                transition={{ duration: 0.36, ease: "easeOut" }}
              />
            ))}
          </React.Fragment>
        ) : (
          <motion.div
            key="skin"
            style={{
              width: "78%",
              height: "78%",
              maxWidth: 260,
              maxHeight: 260,
              borderRadius: "50%",
              border: `1.5px solid color-mix(in srgb, ${CYAN} ${Math.round(ringOpacity * 100)}%, transparent)`,
              background: `radial-gradient(circle at 38% 32%, color-mix(in srgb, ${CYAN} ${Math.round(skinOpacity * 100)}%, transparent), transparent 72%)`,
              boxShadow: `0 0 ${18 + progress * 26}px color-mix(in srgb, ${CYAN} ${Math.round(progress * 40)}%, transparent)`,
            }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={
              reduced
                ? { opacity: 1, scale: swell }
                : {
                    opacity: 1,
                    scale: [swell, swell * (1 + wobble), swell],
                  }
            }
            exit={{ opacity: 0, scale: 0.6 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    scale: wobble
                      ? {
                          duration: 0.26 - near * 0.1,
                          ease: "easeInOut",
                          repeat: Infinity,
                        }
                      : { type: "spring", stiffness: 320, damping: 18 },
                    opacity: { type: "spring", stiffness: 300, damping: 26 },
                  }
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const popStyle: React.CSSProperties = {
  position: "absolute",
  width: "70%",
  height: "70%",
  maxWidth: 240,
  maxHeight: 240,
  borderRadius: "50%",
  border: `2px solid color-mix(in srgb, ${CYAN} 82%, transparent)`,
  background: `radial-gradient(circle, color-mix(in srgb, ${CYAN} 32%, transparent), transparent 66%)`,
};

const shardStyle: React.CSSProperties = {
  position: "absolute",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: STUDIO_COLORS.accent,
};
