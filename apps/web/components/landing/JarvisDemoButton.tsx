"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "speaking" | "error";

export function JarvisDemoButton() {
  const [state, setState] = useState<State>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastIdxRef = useRef<number | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Tear down any in-flight playback on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      utterRef.current = null;
    };
  }, []);

  function stopAll() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    utterRef.current = null;
  }

  async function handleClick() {
    if (state === "loading" || state === "speaking") {
      stopAll();
      setState("idle");
      return;
    }

    setState("loading");

    // Pick a line that's different from the last one (when possible).
    const COUNT = 6; // matches DEMO_LINES.length on the server
    let lineId = Math.floor(Math.random() * COUNT);
    if (lastIdxRef.current !== null && COUNT > 1 && lineId === lastIdxRef.current) {
      lineId = (lineId + 1) % COUNT;
    }
    lastIdxRef.current = lineId;

    try {
      const res = await fetch("/api/landing/jarvis-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId }),
      });

      // 502 → server says "no upstream"; body has the text to read with SpeechSynthesis.
      if (res.status === 502) {
        const data = (await res.json()) as { fallback?: boolean; text?: string };
        if (data.text && typeof window !== "undefined" && window.speechSynthesis) {
          speakWithBrowser(data.text);
          return;
        }
        setState("error");
        return;
      }

      if (!res.ok) {
        setState("error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => setState("speaking");
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setState("error");
      };
      await audio.play();
    } catch {
      setState("error");
    }
  }

  function speakWithBrowser(text: string) {
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const gb = voices.find((v) => v.lang === "en-GB");
    if (gb) u.voice = gb;
    u.onstart = () => setState("speaking");
    u.onend = () => {
      utterRef.current = null;
      setState("idle");
    };
    u.onerror = () => {
      utterRef.current = null;
      setState("error");
    };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  }

  const label =
    state === "loading"
      ? "Summoning…"
      : state === "speaking"
        ? "Speaking — tap to stop"
        : state === "error"
          ? "Try again"
          : "Hear JARVIS speak";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Play a line from JARVIS"
      aria-pressed={state === "speaking"}
      className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors duration-150 cursor-pointer"
      style={{
        background:
          state === "speaking"
            ? "color-mix(in oklch, var(--hud-cyan) 18%, var(--surface-raised))"
            : "var(--surface-raised)",
        color:
          state === "speaking" || state === "loading"
            ? "var(--hud-cyan-light)"
            : "var(--ink)",
        border: "1px solid var(--edge-hud)",
        boxShadow:
          state === "speaking" || state === "loading"
            ? "var(--glow-hud-subtle)"
            : "none",
      }}
    >
      <Icon state={state} />
      {label}
    </button>
  );
}

function Icon({ state }: { state: State }) {
  if (state === "speaking") {
    // Three animated bars — speaker-like equalizer.
    return (
      <span className="inline-flex items-end gap-[2px] h-3.5 w-3.5">
        <span className="w-[2px] h-2 bg-current animate-pulse" style={{ animationDuration: "650ms" }} />
        <span className="w-[2px] h-3 bg-current animate-pulse" style={{ animationDuration: "500ms" }} />
        <span className="w-[2px] h-2.5 bg-current animate-pulse" style={{ animationDuration: "800ms" }} />
      </span>
    );
  }
  if (state === "loading") {
    return (
      <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
    );
  }
  // Idle / error — a play triangle.
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 2.5L9.5 6L3 9.5V2.5Z" fill="currentColor" />
    </svg>
  );
}
