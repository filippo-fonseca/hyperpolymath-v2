"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { streamJarvis } from "@/components/jarvis/jarvis-stream-client";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { stripSystemTags } from "@/lib/jarvis/strip-system-tags";

/**
 * GlobalJarvisHandler — voice transcript pipeline for pages WITHOUT the
 * full JARVIS Console mounted.
 *
 * Voice listening is global (JarvisListener in (app)/layout.tsx grabs the
 * mic + transcribes) but JarvisConsole only mounts on /today. Without this
 * handler, "Hey Jarvis, add task X" from /calendar would transcribe, fire
 * the jarvis-voice-transcript event, and nobody would pick it up.
 *
 * This component owns the same submit → action → TTS chain JarvisConsole
 * runs, minus the scrollback UI:
 *   - POST /api/jarvis with the transcript
 *   - Render action receipts as toast notifications
 *   - Dispatch jarvis-voice-speak on response completion (TTS + FSM cycle)
 *
 * Mount-once contract: the listener is bound ONLY when JarvisConsole is NOT
 * mounted on the current page (currently /today). Avoids double-processing.
 */
export function GlobalJarvisHandler() {
  const pathname = usePathname();
  const { settings: voiceSettings } = useVoiceSettings();
  const voiceSettingsRef = useRef(voiceSettings);
  voiceSettingsRef.current = voiceSettings;

  // /today owns its own jarvis-voice-transcript handler via JarvisConsole.
  // Bind the global handler everywhere else under (app).
  const isConsolePage = pathname === "/today";

  useEffect(() => {
    if (isConsolePage) return;

    let abort: AbortController | null = null;

    function handleVoiceTranscript(e: Event) {
      const detail = (e as CustomEvent<{ transcript: string }>).detail;
      if (!detail?.transcript?.trim()) return;

      // Cancel any in-flight call before starting a new one.
      abort?.abort();
      abort = new AbortController();

      let accumulatedText = "";

      void streamJarvis(
        {
          input: detail.transcript,
          history: [],
          parsedDates: [],
          parsedPriority: undefined,
          slashCommand: null,
          linkedProjectIds: [],
          linkedHashtags: [],
        },
        {
          onText: (delta) => {
            accumulatedText += delta;
          },
          onQueued: () => {
            // No-op — receipts surface via onAction (with the real result).
          },
          onClarification: (data) => {
            toast(data.question, {
              description: "Tap to reply from /today",
              duration: 8000,
            });
          },
          onAction: (data) => {
            if (!data.result?.ok) {
              toast.error(
                data.result?.error ?? "JARVIS action failed",
              );
              return;
            }
            const receipt = data.result.receipt ?? {};
            const summary =
              typeof (receipt as { title?: unknown }).title === "string"
                ? `${prettyToolName(data.name)}: ${(receipt as { title: string }).title}`
                : `${prettyToolName(data.name)} filed`;
            toast.success(summary, { duration: 4000 });
          },
          onDone: () => {
            // Mirror JarvisConsole: always dispatch so JarvisListener cycles
            // its FSM back to listening (and opens the follow-up window).
            const cleaned = stripSystemTags(accumulatedText);
            window.dispatchEvent(
              new CustomEvent("jarvis-voice-speak", {
                detail: {
                  text: cleaned.length > 0 ? cleaned : "Done, sir.",
                  voiceId: voiceSettingsRef.current.voiceId,
                },
              }),
            );
            abort = null;
          },
          onError: (message) => {
            if (message !== "aborted") {
              toast.error(`JARVIS: ${message}`);
            }
            abort = null;
          },
        },
        abort.signal,
      );
    }

    function handleCancel() {
      abort?.abort();
      abort = null;
    }

    window.addEventListener("jarvis-voice-transcript", handleVoiceTranscript);
    window.addEventListener("jarvis-cancel", handleCancel);
    return () => {
      window.removeEventListener("jarvis-voice-transcript", handleVoiceTranscript);
      window.removeEventListener("jarvis-cancel", handleCancel);
      abort?.abort();
    };
  }, [isConsolePage]);

  return null;
}

function prettyToolName(name: string): string {
  switch (name) {
    case "create_task":
      return "Task";
    case "create_capture":
      return "Capture";
    case "create_event":
      return "Event";
    case "remember_fact":
      return "Fact";
    case "ask_clarification":
      return "Clarification";
    default:
      return name;
  }
}
