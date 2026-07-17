import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CameraIcon } from "@hyperpolymath/ui-icons";

import { SD_FONT, SD_FUNCTIONAL, SD_INK, SD_RADIUS, SD_SURFACES } from "../tokens";

type Status = "loading" | "live" | "error";

export default function CameraWidget(): React.ReactElement {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Requesting camera…");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const stop = (): void => {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
      }
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    const start = async (): Promise<void> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Camera not available on this device");
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          // Unmounted (closed or stowed) before the prompt resolved: release now.
          for (const track of media.getTracks()) track.stop();
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play().catch(() => undefined);
        }
        setStatus("live");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission denied"
            : "Camera unavailable",
        );
      }
    };

    void start();
    // Cleanup runs on unmount — which happens both on close (removed) and on
    // stow (filtered out of the render tree). Stopping the tracks here is what
    // turns the camera LED back off in both cases.
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        overflow: "hidden",
        // The feed is the content, so it sits on the recessed rung rather than
        // the card surface — it reads as an inset viewport, not a tile.
        background: SD_SURFACES.darkerBox,
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Live camera preview"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          opacity: status === "live" ? 1 : 0,
          transition: reduced ? undefined : "opacity 0.4s ease",
        }}
      />

      {/* Slim HUD frame. Hairline over accent ring: §16 bans accent rings as
          chrome, and a 1px --sd-line frame says the same thing more quietly. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 8,
          pointerEvents: "none",
          borderRadius: SD_RADIUS.chip,
          boxShadow: `inset 0 0 0 1px ${SD_SURFACES.line}`,
        }}
      />

      {status === "live" ? (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 7px",
            borderRadius: SD_RADIUS.chip,
            // Sealed D1: this overlay is chrome sitting over the feed, so its
            // blur(4px) STAYS. Only the fill is re-tokenised.
            background: `color-mix(in srgb, ${SD_SURFACES.menu} 62%, transparent)`,
            backdropFilter: "blur(4px)",
          }}
        >
          <motion.span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              // Functional ink as a status dot — the one use §2 sanctions.
              background: SD_FUNCTIONAL.coral,
            }}
            animate={reduced ? undefined : { opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
          />
          <span
            style={{
              color: SD_INK.base,
              fontFamily: SD_FONT.mono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.16em",
            }}
          >
            LIVE
          </span>
        </div>
      ) : null}

      {status !== "live" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 16,
            textAlign: "center",
          }}
        >
          {status === "error" ? (
            // 40px dimensional icon at 40% opacity — the DS §9 empty-state
            // grammar, replacing the lucide glyph on a named-noun surface (§13).
            <span style={{ opacity: 0.4, lineHeight: 0 }}>
              <CameraIcon size={40} />
            </span>
          ) : null}
          <p
            style={{
              margin: 0,
              color: status === "error" ? SD_FUNCTIONAL.coral : SD_INK.faint,
              fontFamily: SD_FONT.mono,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {message}
          </p>
        </div>
      ) : null}
    </div>
  );
}
