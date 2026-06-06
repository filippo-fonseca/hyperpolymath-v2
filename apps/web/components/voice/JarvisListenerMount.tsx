"use client";

import dynamic from "next/dynamic";

import { usePhysicalExtensionSetting } from "@/lib/voice/physical-extension/use-physical-extension-setting";
import { useVoiceSourceStatus } from "@/lib/voice/use-voice-source-status";

const JarvisListener = dynamic(
  () =>
    import("@/components/voice/JarvisListener").then((m) => ({
      default: m.JarvisListener,
    })),
  { ssr: false },
);

const PhysicalExtensionRecorder = dynamic(
  () =>
    import("@/components/voice/PhysicalExtensionRecorder").then((m) => ({
      default: m.PhysicalExtensionRecorder,
    })),
  { ssr: false },
);

const JarvisVoicePlayer = dynamic(
  () =>
    import("@/components/voice/JarvisVoicePlayer").then((m) => ({
      default: m.JarvisVoicePlayer,
    })),
  { ssr: false },
);

/**
 * Routes between the two voice-listener implementations:
 *
 *   - Physical Extension Mode OFF → JarvisListener (Phase 7 / 5-state
 *     FSM + ambient VAD + optional Porcupine wake-word + PTT).
 *   - Physical Extension Mode ON  → PhysicalExtensionRecorder (event-
 *     driven, mic acquires ONLY on Arduino wake-fire, releases after
 *     VAD detects end-of-speech).
 *
 * HARD GUARD (Phase 14-03): when the desktop daemon has a fresh voice-source
 * claim (desktopClaimed === true), NEITHER implementation mounts.  This
 * means getUserMedia is NEVER called, the VAD/Porcupine workers are NEVER
 * initialized, and Safari never shows a per-session mic permission prompt.
 *
 * The claim is polled every 2.5 s via useVoiceSourceStatus.  When the desktop
 * quits (or its heartbeat lapses > 30 s), desktopClaimed flips to false and
 * the chosen implementation remounts automatically — mic infrastructure
 * restores within ~2.5 s.
 *
 * The soft early-return in use-physical-extension.ts (desktopClaimed in the
 * SSE trigger payload) remains as a belt-and-braces backup for the brief
 * polling window between a claim becoming active and the hook re-rendering.
 *
 * isLoading guard: hold off mounting until the first poll resolves.
 * Defaults to desktopClaimed=false so we never block the mic on startup
 * before we know whether the desktop is running — conservative in the safe
 * direction (desktop heartbeat will suppress within 2.5 s if it IS running).
 */
export function JarvisListenerMount() {
  const { enabled: physicalExtensionEnabled, mounted } =
    usePhysicalExtensionSetting();
  const { desktopClaimed, isLoading } = useVoiceSourceStatus();

  // Wait for both: the PE setting to hydrate from localStorage AND the first
  // voice-source status poll to complete so we never briefly flash the wrong
  // mic path during hydration.
  if (!mounted || isLoading) return null;

  // Hard guard: desktop owns the mic — do NOT mount any browser mic path.
  // BUT still mount the TTS-only JarvisVoicePlayer so JARVIS can talk back
  // when it responds to a desktop-captured turn (without it, the user gets
  // text-only replies in physical extender mode).
  if (desktopClaimed) return <JarvisVoicePlayer />;

  if (physicalExtensionEnabled) {
    return <PhysicalExtensionRecorder />;
  }
  return <JarvisListener />;
}
