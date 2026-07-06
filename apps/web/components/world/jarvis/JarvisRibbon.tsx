"use client";

/**
 * JarvisRibbon.tsx — U-13 · The Studiolo · jarvis-ring
 *
 * The parchment glass ribbon: a heroGlass plane (hero #2 of the ≤3 transmission
 * budget), the ONE drei `<Html>` DOM `<input>` in the MVP scene (real caret, real
 * IME — the TECH hard rule, PLAN §10 row 1), and one italic-Garamond drei `<Text>`
 * whose content is mutated IMPERATIVELY from `handle.replyBuffer` on a ≤50 ms
 * throttle (the U-17 typewriter precedent — NO per-delta React render).
 *
 * Returns null while `handle.state === "idle"` (the familiar rests as a bare ring
 * at the shoulder; the ribbon only exists once summoned).
 */

import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSpring, animated } from "@react-spring/three";
import { Html, Text } from "@react-three/drei";
import { STUDIOLO } from "../materials/tokens";
import { heroGlass } from "../materials/hologram";
import { EB_GARAMOND_ITALIC } from "../text/fonts";
import {
  setJarvisWorldInputFocuser,
  type JarvisWorldHandle,
} from "./useJarvisWorld";
import { useWorldPrefs } from "../prefs/useWorldPrefs";

// ── Module singletons (never per-frame allocation) ──────────────────────────
const RIBBON_PLANE = new THREE.PlaneGeometry(0.72, 0.18);
const FLASH_FRAME = new THREE.PlaneGeometry(0.78, 0.24);
const FLASH_MATERIAL = new THREE.MeshBasicMaterial({
  color: STUDIOLO.emberAlarm,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

const FLASH_MS = 600;
const TAIL_CHARS = 280; // bounds troika re-layout on long replies (§4.3)
const UNROLL_CONFIG = { tension: 220, friction: 26 } as const; // PLAN §6 U-13

/** The mutable troika-`<Text>` surface the flush loop touches (drei ref is loose). */
interface TroikaText {
  text: string;
  sync: (cb?: () => void) => void;
}

export interface JarvisRibbonProps {
  handle: JarvisWorldHandle;
}

/** Last `n` chars, with a leading ellipsis when the buffer is clipped. */
function tail(s: string, n: number): string {
  return s.length <= n ? s : "\u2026" + s.slice(s.length - n);
}

export function JarvisRibbon(props: JarvisRibbonProps): React.ReactElement | null {
  const { handle } = props;
  const { state, clarification, errorMessage } = handle;
  const invalidate = useThree((s) => s.invalidate);
  const { reducedMotion: reduced } = useWorldPrefs();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<TroikaText | null>(null);
  const flashMeshRef = useRef<THREE.Mesh>(null);
  const flushedVersion = useRef(-1);
  const lastFlushAt = useRef(0);
  const flashStart = useRef<number | null>(null);
  const lastErrorSeen = useRef<string | null>(null);

  // Unroll: spring scale-x 0→1 about the ring (left edge). The ribbon only
  // mounts when open, so this animates on summon; instant under reduced motion.
  const { ux } = useSpring({
    from: { ux: 0 },
    to: { ux: 1 },
    config: UNROLL_CONFIG,
    immediate: reduced,
  });

  // Register the input focuser so summon() can refocus an already-open ribbon.
  useEffect(() => {
    setJarvisWorldInputFocuser(() => inputRef.current?.focus());
    return () => setJarvisWorldInputFocuser(null);
  }, []);

  // Focus + clear on entering `listening` (the Html node mounts this commit; rAF
  // beats the portal's layout). Covers both summon and the post-turn follow-up.
  useEffect(() => {
    if (state !== "listening") return;
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.value = "";
        el.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [state]);

  // Arm the error edge-flash when errorMessage changes (normal motion only —
  // reduced motion uses the static DOM border on the error line, §8).
  useEffect(() => {
    if (errorMessage && errorMessage !== lastErrorSeen.current) {
      lastErrorSeen.current = errorMessage;
      if (!reduced) {
        flashStart.current = performance.now();
        invalidate();
      }
    }
    if (!errorMessage) lastErrorSeen.current = null;
  }, [errorMessage, reduced, invalidate]);

  // ONE useFrame: throttled troika flush + the 600 ms flash decay.
  useFrame(() => {
    // Streamed ink — flush at most every 50 ms, on demanded frames only.
    const mesh = textRef.current;
    if (mesh && flushedVersion.current !== handle.replyVersion.current) {
      const now = performance.now();
      if (now - lastFlushAt.current >= 50) {
        mesh.text = tail(handle.replyBuffer.current, TAIL_CHARS);
        mesh.sync(() => invalidate()); // render the new glyphs when layout lands
        flushedVersion.current = handle.replyVersion.current;
        lastFlushAt.current = now;
      }
    }

    // Error edge flash: parchment → ember → parchment over 600 ms. The frame
    // mesh is culled (visible=false) except during the flash, so the steady-state
    // draw-call count stays at 5 (§1.1) — the 6th is transient, within the ≤6 budget.
    const flashMesh = flashMeshRef.current;
    if (flashStart.current !== null) {
      const e = performance.now() - flashStart.current;
      if (e < FLASH_MS) {
        FLASH_MATERIAL.opacity = Math.sin(Math.PI * (e / FLASH_MS)) * 0.5;
        if (flashMesh) flashMesh.visible = true;
        invalidate();
      } else {
        FLASH_MATERIAL.opacity = 0;
        if (flashMesh) flashMesh.visible = false;
        flashStart.current = null;
      }
    }
  });

  if (state === "idle") return null;

  const disabled = state !== "listening";

  const onInputKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const value = ev.currentTarget.value;
      if (clarification) handle.answerClarification(value);
      else handle.submit(value);
      ev.currentTarget.value = "";
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      handle.dismiss();
    }
  };

  return (
    <group>
      {/* Glass — unrolls scale-about-left-edge: wrapper origin at the ring, the
          plane offset +0.36 inside so its LEFT edge sits at the wax seal. */}
      <animated.group position={[-0.3, 0, 0]} scale-x={ux}>
        <mesh geometry={RIBBON_PLANE} position={[0.36, 0, 0]}>
          {heroGlass({ tint: STUDIOLO.parchment })}
        </mesh>
      </animated.group>

      {/* Error edge flash frame — behind the glass, coral pulse on failure.
          Culled until a flash arms so it never costs a steady-state draw call. */}
      <mesh
        ref={flashMeshRef}
        geometry={FLASH_FRAME}
        material={FLASH_MATERIAL}
        position={[0.06, 0, -0.002]}
        visible={false}
      />

      {/* Streamed reply — italic Garamond SDF, mutated imperatively (§4.3). */}
      <Text
        ref={(o: TroikaText | null) => {
          textRef.current = o;
        }}
        font={EB_GARAMOND_ITALIC}
        sdfGlyphSize={64}
        fontSize={0.028}
        color={STUDIOLO.parchment}
        anchorX="left"
        anchorY="top"
        maxWidth={0.62}
        position={[-0.28, 0.01, 0.003]}
        clipRect={[0, -0.15, 0.62, 0]}
      >
        {""}
      </Text>

      {/* THE one <Html> root in the MVP scene: real DOM input + chips + error. */}
      <Html
        transform
        occlude="blending"
        distanceFactor={1.2}
        position={[0.06, 0.045, 0.004]}
        style={{ pointerEvents: "auto" }}
      >
        <div style={CONTAINER_STYLE}>
          <input
            ref={inputRef}
            type="text"
            spellCheck={false}
            disabled={disabled}
            placeholder={"Ask Kiwi\u2026"}
            onKeyDown={onInputKeyDown}
            style={INPUT_STYLE}
          />
          {clarification && clarification.options.length > 0 && (
            <div style={CHIP_ROW_STYLE}>
              {clarification.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    handle.answerClarification(option);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  style={CHIP_STYLE}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {state === "error" && errorMessage && (
            <div style={ERROR_LINE_STYLE}>{errorMessage}</div>
          )}
        </div>
      </Html>
    </group>
  );
}

// ── DOM styles — Parchment on DeepVellum, EB Garamond italic (the (app) layout
//    loads it via next/font as --font-eb-garamond); a ruled-journal underline. ──
const CONTAINER_STYLE: CSSProperties = {
  width: 640,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  userSelect: "none",
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: `1px solid ${STUDIOLO.sepiaInk}`,
  outline: "none",
  color: STUDIOLO.parchment,
  font: "italic 26px var(--font-eb-garamond, Georgia, serif)",
  padding: "4px 2px",
  caretColor: STUDIOLO.jarvisCyan,
};

const CHIP_ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const CHIP_STYLE: CSSProperties = {
  background: "rgba(95,208,255,0.12)",
  border: `1px solid ${STUDIOLO.jarvisCyan}`,
  borderRadius: 999,
  color: STUDIOLO.parchment,
  font: "14px var(--font-eb-garamond, Georgia, serif)",
  padding: "4px 12px",
  cursor: "pointer",
};

const ERROR_LINE_STYLE: CSSProperties = {
  color: STUDIOLO.emberAlarm,
  font: "italic 14px var(--font-eb-garamond, Georgia, serif)",
  border: `1px solid ${STUDIOLO.emberAlarm}`,
  borderRadius: 6,
  padding: "4px 8px",
};

export default JarvisRibbon;
