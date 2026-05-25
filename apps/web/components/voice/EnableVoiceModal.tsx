"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AUDIO_CONSTRAINTS,
  DEFAULT_VOICE_ID,
  WELCOME_GREETING,
} from "@/lib/voice/constants";
import { unlockAudioContext } from "@/lib/voice/audio-context";
import { cn } from "@/lib/utils";

/**
 * Phase 7 Plan 07-02 — EnableVoiceModal.
 *
 * Implements the D-02 eager onboarding flow:
 *   Stage 1 ("intro"): Request mic permission using getUserMedia with AUDIO_CONSTRAINTS.
 *   Stage 2 ("audition"): Show 3 British voice options; user can play samples.
 *   Stage 3 ("permission-denied"): Actionable error UI with retry (Pitfall 6 defense).
 *
 * CRITICAL CONTRACT (CRITICAL_PHASE7_CONCERNS #1):
 *   AudioContext.resume() MUST be called synchronously inside handleEnableClick —
 *   the browser's autoplay policy requires an AudioContext.resume() call inside
 *   a user-gesture click handler. This is the moment the AudioContext is unlocked
 *   for the lifetime of the session.
 *
 * D-03: On first enable (!hasHeardWelcome), plays "Hello, sir." through the just-
 * unlocked AudioContext as the one-shot welcome greeting.
 */

/** Three British voices — Posh is front-runner for canon-fit per D-03 + RESEARCH. */
const AUDITION_VOICES = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Posh",
    desc: "Theatrical butler — canon-fit (front-runner)",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    desc: "Warm, articulate British male",
  },
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    name: "Dorothy",
    desc: "Wild-card option — distinctive register",
  },
];

/** Sample line used for audition playback (short, representative of JARVIS register). */
const AUDITION_LINE = "Very good, sir. Shall we proceed?";

interface Props {
  open: boolean;
  /** Callback after the user clicks "Enable" and the AudioContext is unlocked. */
  onEnabled: (params: {
    deviceId: string | null;
    voiceId: string;
    audioContext: AudioContext;
  }) => void;
  /** Called when the user dismisses the modal without enabling. */
  onCancel: () => void;
  /** Whether the welcome greeting has already been heard (D-03 / CRITICAL_PHASE7_CONCERNS #7). */
  hasHeardWelcome: boolean;
}

type Stage = "intro" | "permission-denied" | "audition";

export function EnableVoiceModal({
  open,
  onEnabled,
  onCancel,
  hasHeardWelcome,
}: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [autoRequestFailed, setAutoRequestFailed] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Reset to intro stage each time the modal opens.
  useEffect(() => {
    if (open) {
      setStage("intro");
      setSelectedVoiceId(DEFAULT_VOICE_ID);
      setAuditioning(null);
      setEnabling(false);
      setRequestingPermission(false);
      setAutoRequestFailed(false);
    }
  }, [open]);

  /**
   * Acquire the mic stream. Extracted so we can call it from BOTH the
   * mount-effect (which Chrome/Firefox honor without issue) AND from a
   * click handler (which Safari/WebKit require — the prompt only shows
   * up if the getUserMedia call is dispatched inside a user-gesture
   * frame, and a useEffect after a modal-open is no longer a gesture).
   */
  async function requestMicPermission() {
    if (requestingPermission) return;
    setRequestingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
      });
      streamRef.current = stream;
      setStage("audition");
    } catch (err) {
      console.warn("[voice] mic permission denied or unavailable", err);
      setStage("permission-denied");
    } finally {
      setRequestingPermission(false);
    }
  }

  // Auto-request on intro stage (Chrome/Firefox path). If Safari silently
  // drops it (no prompt, no rejection), the explicit "Grant access" button
  // below provides a user-gesture fallback after 1.5s.
  useEffect(() => {
    if (!open || stage !== "intro") return;
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStage("audition");
      } catch (err) {
        console.warn("[voice] auto mic request failed", err);
        if (!cancelled) setStage("permission-denied");
      }
    })();

    // Safari sometimes neither resolves nor rejects when the call isn't in
    // a gesture frame — surface the click-to-grant fallback button so the
    // user isn't stuck on "Awaiting permission…" forever.
    fallbackTimer = setTimeout(() => {
      if (!cancelled) setAutoRequestFailed(true);
    }, 1500);

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [open, stage]);

  // Clean up mic stream when modal closes without enabling.
  useEffect(() => {
    if (!open && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [open]);

  /**
   * Audition a voice — HTTP fetch to /api/jarvis/tts (NOT WebSocket; one-shot is fine),
   * decode + play through a transient AudioContext (distinct from the session context
   * which is created on the Enable click).
   */
  async function handleAudition(voiceId: string) {
    if (auditioning) return; // Prevent concurrent auditions
    setAuditioning(voiceId);
    try {
      const res = await fetch("/api/jarvis/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: AUDITION_LINE, voiceId }),
      });
      if (!res.ok) throw new Error(`audition failed ${res.status}`);
      const buf = await res.arrayBuffer();
      // Transient context for audition only; the real one is created in handleEnableClick.
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => {
        ctx.close();
        setAuditioning(null);
      };
    } catch (err) {
      console.error("[voice] audition failed", err);
      setAuditioning(null);
    }
  }

  /**
   * THE CRITICAL CLICK HANDLER — AudioContext unlock + welcome greeting in one user-gesture frame.
   *
   * CRITICAL_PHASE7_CONCERNS #1: AudioContext.resume() is called synchronously inside
   * this click handler (the user-gesture frame). Browsers suspend new AudioContexts
   * by default; calling resume() here (or immediately after creation inside the
   * same microtask queue flush from this click) satisfies the autoplay policy.
   *
   * CRITICAL_PHASE7_CONCERNS #7: If !hasHeardWelcome, play "Hello, sir." through the
   * just-unlocked AudioContext and let the caller persist hasHeardWelcome=true.
   *
   * CRITICAL_PHASE7_CONCERNS #9: enumerateDevices() is called AFTER getUserMedia grant
   * (browsers return empty deviceLabels before permission is granted).
   */
  async function handleEnableClick() {
    setEnabling(true);
    try {
      // 1. Unlock the SHARED AudioContext SYNCHRONOUSLY in this click handler
      //    (Pattern 6 / CRITICAL_PHASE7_CONCERNS #1 — autoplay unlock).
      //    The shared singleton in lib/voice/audio-context.ts is reused by
      //    JarvisListener + TtsPlayer so they don't create their own
      //    suspended contexts outside a user gesture.
      const audioContext = await unlockAudioContext();
      audioContextRef.current = audioContext;

      // 2. Capture chosen mic deviceId via enumerateDevices (now permitted post-grant).
      //    CRITICAL_PHASE7_CONCERNS #9: enumerateDevices AFTER getUserMedia so labels
      //    are populated and the correct device ID is captured.
      let deviceId: string | null = null;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const firstInput = devices.find((d) => d.kind === "audioinput");
        deviceId = firstInput?.deviceId ?? null;
      } catch (err) {
        console.warn("[voice] enumerateDevices failed", err);
      }

      // 3. One-shot welcome greeting on first enable (D-03 / CRITICAL_PHASE7_CONCERNS #7).
      //    Plays "Hello, sir." through the just-unlocked AudioContext.
      //    hasHeardWelcome gates this so it only plays once, ever.
      if (!hasHeardWelcome) {
        try {
          const res = await fetch("/api/jarvis/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: WELCOME_GREETING,
              voiceId: selectedVoiceId,
            }),
          });
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const decoded = await audioContext.decodeAudioData(buf);
            const src = audioContext.createBufferSource();
            src.buffer = decoded;
            src.connect(audioContext.destination);
            src.start();
          }
        } catch (err) {
          // Non-fatal — welcome greeting failure should NOT block enabling voice.
          console.warn("[voice] welcome greeting failed", err);
        }
      }

      // 4. Hand control to the caller — VoiceSettingsSection persists
      //    { voiceEnabled: true, micDeviceId, voiceId, hasHeardWelcome: true }.
      onEnabled({ deviceId, voiceId: selectedVoiceId, audioContext });
    } catch (err) {
      console.error("[voice] EnableVoiceModal: enable failed", err);
      setEnabling(false);
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enable JARVIS Voice</DialogTitle>
          <DialogDescription>
            {stage === "intro" && "Requesting microphone access…"}
            {stage === "permission-denied" &&
              "Microphone access denied. To enable, open your browser's site settings and allow microphone for this domain, then try again."}
            {stage === "audition" &&
              "Choose a voice. Tap a name to audition, then click Enable."}
          </DialogDescription>
        </DialogHeader>

        {/* Audition stage — voice picker */}
        {stage === "audition" && (
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              {AUDITION_VOICES.map((v) => {
                const isSelected = selectedVoiceId === v.id;
                const isPlaying = auditioning === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setSelectedVoiceId(v.id);
                      void handleAudition(v.id);
                    }}
                    aria-pressed={isSelected}
                    disabled={auditioning !== null}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-md border transition-colors duration-150 ease-out",
                      "font-serif text-sm",
                      isSelected
                        ? "border-[var(--hud-cyan)] bg-[var(--surface-raised)] text-[var(--ink)]"
                        : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <span className="font-semibold">{v.name}</span>
                    <span className="mx-2 text-[var(--ink-muted)]">—</span>
                    <span>{v.desc}</span>
                    {isPlaying && (
                      <span className="ml-2 font-mono text-xs text-[var(--hud-cyan)] uppercase tracking-wider">
                        playing…
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() => void handleEnableClick()}
                disabled={enabling}
                className="font-mono text-xs uppercase tracking-wider"
              >
                {enabling ? "Enabling…" : "Enable"}
              </Button>
            </div>
          </div>
        )}

        {/* Permission-denied stage — actionable error (Pitfall 6 defense) */}
        {stage === "permission-denied" && (
          <div className="space-y-4 pt-2">
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Without microphone access, wake-word detection and voice input
              cannot function. Voice will remain disabled until you grant
              permission.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="font-mono text-xs uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => setStage("intro")}
                className="font-mono text-xs uppercase tracking-wider"
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Intro stage — waiting for mic permission */}
        {stage === "intro" && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--hud-cyan)] animate-pulse" />
              <span className="font-mono text-xs text-[var(--ink-muted)] uppercase tracking-wider">
                {requestingPermission
                  ? "Requesting…"
                  : autoRequestFailed
                    ? "Click to grant microphone access"
                    : "Awaiting permission…"}
              </span>
            </div>
            {/* Safari fallback: dispatch getUserMedia from a click so the
                request lands inside a user-gesture frame. Surfaces after a
                1.5s grace period if the auto-call hasn't resolved. */}
            {autoRequestFailed && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void requestMicPermission()}
                  disabled={requestingPermission}
                  className="font-mono text-xs uppercase tracking-wider"
                >
                  {requestingPermission ? "Requesting…" : "Grant access"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
