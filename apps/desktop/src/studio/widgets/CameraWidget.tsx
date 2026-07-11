import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CameraOff } from "lucide-react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";

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
        background: STUDIO_COLORS.background,
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

      {/* Slim HUD frame corners */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 8,
          pointerEvents: "none",
          borderRadius: 4,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${STUDIO_COLORS.accent} 34%, transparent)`,
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
            borderRadius: 4,
            background: "color-mix(in srgb, #020305 62%, transparent)",
            backdropFilter: "blur(4px)",
          }}
        >
          <motion.span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: STUDIO_COLORS.danger,
            }}
            animate={reduced ? undefined : { opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
          />
          <span
            style={{
              color: STUDIO_COLORS.text,
              fontFamily: STUDIO_MONO,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.2em",
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
            <CameraOff size={22} color={STUDIO_COLORS.muted} aria-hidden />
          ) : null}
          <p
            style={{
              margin: 0,
              color: status === "error" ? STUDIO_COLORS.danger : STUDIO_COLORS.muted,
              fontFamily: STUDIO_MONO,
              fontSize: 10,
              letterSpacing: "0.12em",
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
