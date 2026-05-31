"use client";

import dynamic from "next/dynamic";

import { usePhysicalExtensionSetting } from "@/lib/voice/physical-extension/use-physical-extension-setting";

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

/**
 * Routes between the two voice-listener implementations:
 *
 *   - Physical Extension Mode OFF → JarvisListener (Phase 7 / 5-state
 *     FSM + ambient VAD + optional Porcupine wake-word + PTT).
 *   - Physical Extension Mode ON  → PhysicalExtensionRecorder (event-
 *     driven, mic acquires ONLY on Arduino wake-fire, releases after
 *     VAD detects end-of-speech).
 *
 * The setting hook gates on `mounted` so we don't briefly mount
 * JarvisListener during SSR/hydration when the user actually has PE
 * mode on — that brief mount would acquire the mic via JarvisListener's
 * VAD instance before we could swap to the recorder.
 */
export function JarvisListenerMount() {
  const { enabled: physicalExtensionEnabled, mounted } =
    usePhysicalExtensionSetting();

  if (!mounted) return null;

  if (physicalExtensionEnabled) {
    return <PhysicalExtensionRecorder />;
  }
  return <JarvisListener />;
}
