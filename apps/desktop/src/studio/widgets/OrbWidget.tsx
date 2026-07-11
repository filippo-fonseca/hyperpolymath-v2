import { useEffect, useRef, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

import { mountOrb } from "@/hud/orb";
import { studioBridge } from "@studio/bridge";

const CYAN = "#2fa8ff";
const CYAN_HIGH = "#3bd6ff";

const fillStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

const particles = [
  { cx: 31, cy: 17, r: 0.7, delay: 0 },
  { cx: 78, cy: 29, r: 0.5, delay: 1.4 },
  { cx: 19, cy: 68, r: 0.55, delay: 2.8 },
  { cx: 70, cy: 80, r: 0.65, delay: 0.8 },
  { cx: 88, cy: 58, r: 0.45, delay: 3.5 },
] as const;

export default function OrbWidget(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountOrb(canvas, {
      getState: studioBridge.getJarvisState,
      getMicLevel: () => 0.42,
      getSpeakingLevel: () => 0.55,
    });
  }, []);

  return (
    <div
      data-orb-widget
      role="img"
      aria-label="JARVIS voice state orb"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          height: "100%",
          maxWidth: "100%",
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
          filter: `drop-shadow(0 0 18px color-mix(in srgb, ${CYAN_HIGH} 32%, transparent))`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "9%",
            borderRadius: "50%",
            background: `radial-gradient(circle, color-mix(in srgb, ${CYAN_HIGH} 12%, transparent), transparent 67%)`,
            filter: "blur(10px)",
          }}
        />

        <motion.svg
          viewBox="0 0 100 100"
          style={fillStyle}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 34, ease: "linear", repeat: Infinity }}
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={CYAN}
            strokeOpacity="0.32"
            strokeWidth="0.55"
            strokeDasharray="21 9 3 14"
          />
          <circle
            cx="50"
            cy="50"
            r="39"
            fill="none"
            stroke={CYAN_HIGH}
            strokeOpacity="0.38"
            strokeWidth="0.4"
            strokeDasharray="2 11 28 15"
          />
        </motion.svg>

        <motion.svg
          viewBox="0 0 100 100"
          style={fillStyle}
          animate={reduced ? undefined : { rotate: -360 }}
          transition={{ duration: 49, ease: "linear", repeat: Infinity }}
        >
          <circle
            cx="50"
            cy="50"
            r="34"
            fill="none"
            stroke={CYAN_HIGH}
            strokeOpacity="0.48"
            strokeWidth="0.7"
            strokeDasharray="36 18 7 22"
          />
          <path
            d="M 16 50 A 34 34 0 0 1 26 25"
            fill="none"
            stroke={CYAN_HIGH}
            strokeLinecap="round"
            strokeOpacity="0.82"
            strokeWidth="1.15"
          />
          <path
            d="M 84 50 A 34 34 0 0 1 74 75"
            fill="none"
            stroke={CYAN}
            strokeLinecap="round"
            strokeOpacity="0.66"
            strokeWidth="0.8"
          />
        </motion.svg>

        <svg viewBox="0 0 100 100" style={fillStyle}>
          {particles.map((particle) => (
            <motion.circle
              key={`${particle.cx}:${particle.cy}`}
              cx={particle.cx}
              cy={particle.cy}
              r={particle.r}
              fill={CYAN_HIGH}
              initial={{ opacity: 0.18 }}
              animate={
                reduced
                  ? { opacity: 0.25 }
                  : { opacity: [0.12, 0.55, 0.12], y: [0, -2.5, 0] }
              }
              transition={{
                duration: 5.5,
                delay: particle.delay,
                ease: "easeInOut",
                repeat: reduced ? 0 : Infinity,
              }}
            />
          ))}
        </svg>

        <canvas ref={canvasRef} aria-hidden="true" style={fillStyle} />
      </div>
    </div>
  );
}
