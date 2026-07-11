"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { STUDIOLO } from "../materials/tokens";
import { encodeWav } from "@/lib/voice/encode-wav";
import { streamJarvis } from "@/components/jarvis/jarvis-stream-client";

type State = "idle" | "listening" | "thinking";

export function StudioPushToTalk(): React.ReactElement {
  const reduced = useReducedMotion();
  const [state, setState] = useState<State>("idle");
  const [caption, setCaption] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (captionTimer.current) clearTimeout(captionTimer.current);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const finish = async (): Promise<void> => {
    setState("thinking");
    try {
      const encoded = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType });
      const context = new AudioContext();
      const audio = await context.decodeAudioData(await encoded.arrayBuffer());
      const wav = encodeWav(audio.getChannelData(0), audio.sampleRate);
      await context.close();
      const stt = await fetch("/api/jarvis/stt", {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: wav,
      });
      if (!stt.ok) throw new Error(`Speech recognition failed (${stt.status})`);
      const sttDoneAt = Number(stt.headers.get("x-jarvis-stt-done-at")) || null;
      const { transcript } = await stt.json() as { transcript?: string };
      if (!transcript?.trim()) throw new Error("No speech detected");
      let reply = "";
      await streamJarvis(
        { input: transcript.trim(), history: [] },
        {
          onText: (delta) => { reply += delta; setCaption(reply); },
          onAction: () => {},
          onDone: () => { if (!reply) setCaption("Done."); },
          onError: (message) => { throw new Error(message); },
        },
        undefined,
        true,
        sttDoneAt,
      );
    } catch (error) {
      setCaption(error instanceof Error ? error.message : "Voice request failed");
    } finally {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      setState("idle");
      if (captionTimer.current) clearTimeout(captionTimer.current);
      captionTimer.current = setTimeout(() => setCaption(""), 6_000);
    }
  };

  const toggle = async (): Promise<void> => {
    if (state === "listening") {
      recorderRef.current?.stop();
      return;
    }
    if (state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => { void finish(); };
      recorderRef.current = recorder;
      recorder.start();
      setState("listening");
    } catch {
      setCaption("Microphone permission is required.");
    }
  };

  return (
    <>
      <div className="pointer-events-none absolute bottom-6 left-[calc(50%-105px)] z-30">
        <button
          type="button"
          aria-label={state === "listening" ? "Stop listening" : "Talk to JARVIS"}
          aria-pressed={state === "listening"}
          disabled={state === "thinking"}
          onClick={() => void toggle()}
          className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-xl ${!reduced && state !== "idle" ? "animate-pulse" : ""}`}
          style={{
            color: state === "idle" ? STUDIOLO.moonlace : STUDIOLO.jarvisCyan,
            background: `color-mix(in srgb, ${STUDIOLO.nightwalnut} 90%, transparent)`,
            borderColor: `color-mix(in srgb, ${state === "idle" ? STUDIOLO.brass : STUDIOLO.jarvisCyan} 42%, transparent)`,
          }}
        >
          {state === "listening" ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
        </button>
      </div>
      {caption ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-20 left-1/2 z-30 max-w-[min(680px,80vw)] -translate-x-1/2 rounded-full border px-4 py-2 text-center text-xs backdrop-blur-xl"
          style={{
            color: STUDIOLO.parchment,
            background: `color-mix(in srgb, ${STUDIOLO.deepVellum} 90%, transparent)`,
            borderColor: `color-mix(in srgb, ${STUDIOLO.jarvisCyan} 28%, transparent)`,
          }}
        >
          {caption}
        </div>
      ) : null}
    </>
  );
}
