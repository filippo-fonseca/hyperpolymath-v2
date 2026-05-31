"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { EnableVoiceModal } from "@/components/voice/EnableVoiceModal";
import { AUDIO_CONSTRAINTS } from "@/lib/voice/constants";
import { unlockAudioContext } from "@/lib/voice/audio-context";
import { MicDevicePicker } from "./MicDevicePicker";
import { VoiceIdPicker } from "./VoiceIdPicker";
import { usePhysicalExtensionSetting } from "@/lib/voice/physical-extension/use-physical-extension-setting";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Phase 7 Plan 07-02 — Settings → Voice section.
 *
 * Houses all 7 VOICE-11 controls:
 *   1. Enable voice (toggle)
 *   2. Wake-word phrase (text input)
 *   3. Clap-clap activation (toggle)
 *   4. TTS provider (select: ElevenLabs / Browser SpeechSynthesis / Off)
 *   5. Voice ID picker (radio with audition, via VoiceIdPicker)
 *   6. Discreet mode (toggle)
 *   7. Mic device picker (select, via MicDevicePicker)
 *
 * State source: useVoiceSettings() → persists to localStorage under VOICE_SETTINGS_KEY.
 * EnableVoiceModal is opened on OFF→ON transition; settings persist on modal completion.
 *
 * SSR skeleton: returns a fixed-height placeholder until mounted=true to prevent
 * hydration mismatch (localStorage is not available server-side).
 *
 * No global stores (Zustand / Jotai / XState) per CLAUDE.md constraint.
 */

export function VoiceSettingsSection() {
  const { settings, mounted, update } = useVoiceSettings();
  const [modalOpen, setModalOpen] = useState(false);
  const { enabled: physicalExtensionEnabled, setEnabled: setPhysicalExtensionEnabled } =
    usePhysicalExtensionSetting();

  // SSR skeleton — prevents hydration mismatch.
  // Same pattern as ThemeToggle.tsx (ThemeToggle mount-guard, lines 35-45).
  if (!mounted) {
    return (
      <Card className="p-6 space-y-4 hover:border-[var(--edge-hud)] transition-colors duration-150 ease-out">
        <div className="h-64" aria-hidden="true" />
      </Card>
    );
  }

  /**
   * Enable toggle click handler.
   *
   * First-ever enable (hasHeardWelcome === false): open EnableVoiceModal
   * for the full onboarding flow (mic permission + voice audition +
   * welcome greeting).
   *
   * Re-enable (hasHeardWelcome === true): skip the modal entirely. Ask
   * the browser for mic permission directly from this click — Safari
   * needs the getUserMedia call to land inside a user-gesture frame to
   * show the prompt, and the modal path was stealing that gesture
   * (modal mounts → useEffect → call happens after the gesture lapses,
   * Safari silently drops the prompt). No modal = no trap; if the user
   * denies, voice stays off and a toast surfaces the error.
   *
   * ON → OFF: persist voiceEnabled=false directly.
   */
  async function handleEnableToggle(next: boolean) {
    if (next && !settings.voiceEnabled) {
      if (!settings.hasHeardWelcome) {
        setModalOpen(true);
        return;
      }
      try {
        // Unlock the shared AudioContext + acquire mic, both inside
        // this gesture frame so Safari is happy.
        await unlockAudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
        });
        stream.getTracks().forEach((t) => t.stop());
        update({ voiceEnabled: true });
        toast.success("Voice enabled.");
      } catch (err) {
        console.warn("[voice] re-enable failed", err);
        toast.error(
          "Microphone access is required to enable voice. Check your browser's site permissions.",
        );
      }
    } else if (!next) {
      update({ voiceEnabled: false });
    }
  }

  /**
   * Called by EnableVoiceModal on successful "Enable" click.
   * AudioContext has already been unlocked + welcome greeting played inside
   * the modal's handleEnableClick handler. We persist the resulting settings.
   */
  function handleModalEnabled({
    deviceId,
    voiceId,
  }: {
    deviceId: string | null;
    voiceId: string;
    audioContext: AudioContext;
  }) {
    update({
      voiceEnabled: true,
      micDeviceId: deviceId,
      voiceId,
      hasHeardWelcome: true, // greeting already played inside modal click handler
    });
    setModalOpen(false);
  }

  const voiceDisabled = !settings.voiceEnabled;

  return (
    <>
      <Card className="p-6 space-y-6 hover:border-[var(--edge-hud)] transition-colors duration-150 ease-out">
        {/* Section header */}
        <div>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Voice
          </h2>
          <p className="font-serif text-base text-[var(--ink-muted)] mt-1">
            Speak to JARVIS. Hear receipts spoken aloud in a British voice.
          </p>
        </div>

        {/* 1. Enable voice toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-serif text-base text-[var(--ink)]">
              Enable voice
            </p>
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Enables wake-word detection and spoken receipts.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.voiceEnabled}
            onClick={() => handleEnableToggle(!settings.voiceEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none",
              settings.voiceEnabled
                ? "bg-[var(--hud-cyan)] border-[var(--hud-cyan)]"
                : "bg-[var(--surface-raised)] border-[var(--edge)]",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out",
                settings.voiceEnabled ? "translate-x-5" : "translate-x-0",
              )}
            />
            <span className="sr-only">
              {settings.voiceEnabled ? "Disable voice" : "Enable voice"}
            </span>
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--edge)]" />

        {/* 2. Wake-word phrase */}
        <div className="space-y-2">
          <label
            htmlFor="wake-word-phrase"
            className="block font-serif text-base text-[var(--ink)]"
          >
            Wake-word phrase
          </label>
          <input
            id="wake-word-phrase"
            type="text"
            value={settings.wakeWordPhrase}
            onChange={(e) => update({ wakeWordPhrase: e.target.value })}
            disabled={voiceDisabled}
            placeholder="Hey Jarvis"
            className={cn(
              "w-full rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-2",
              "font-serif text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]",
              "focus:outline-none focus:border-[var(--edge-hud)]",
              "transition-colors duration-150 ease-out",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          />
          <p className="font-serif text-xs text-[var(--ink-muted)]">
            Only <strong>&ldquo;Hey Jarvis&rdquo;</strong> is pre-trained.
            Custom phrases require a .ppn file from{" "}
            <a
              href="https://console.picovoice.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--ink)]"
            >
              Picovoice Console
            </a>
            .
          </p>
        </div>

        {/* 3. Clap-clap activation */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-serif text-base text-[var(--ink)]">
              Clap activation
            </p>
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Clap twice in quick succession to activate JARVIS.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.clapEnabled}
            onClick={() =>
              !voiceDisabled && update({ clapEnabled: !settings.clapEnabled })
            }
            disabled={voiceDisabled}
            className={cn(
              "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none",
              settings.clapEnabled && !voiceDisabled
                ? "bg-[var(--hud-cyan)] border-[var(--hud-cyan)]"
                : "bg-[var(--surface-raised)] border-[var(--edge)]",
              voiceDisabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out",
                settings.clapEnabled && !voiceDisabled
                  ? "translate-x-5"
                  : "translate-x-0",
              )}
            />
            <span className="sr-only">
              {settings.clapEnabled ? "Disable clap activation" : "Enable clap activation"}
            </span>
          </button>
        </div>

        {/* 4. TTS provider */}
        <div className="space-y-2">
          <label
            htmlFor="tts-provider"
            className="block font-serif text-base text-[var(--ink)]"
          >
            TTS provider
          </label>
          <select
            id="tts-provider"
            value={settings.ttsProvider}
            onChange={(e) =>
              update({
                ttsProvider: e.target.value as
                  | "elevenlabs"
                  | "browser"
                  | "off",
              })
            }
            disabled={voiceDisabled}
            className={cn(
              "w-full rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-2",
              "font-serif text-sm text-[var(--ink)]",
              "focus:outline-none focus:border-[var(--edge-hud)]",
              "transition-colors duration-150 ease-out",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <option value="elevenlabs">ElevenLabs (British voice)</option>
            <option value="browser">Browser SpeechSynthesis (fallback)</option>
            <option value="off">Off (no spoken receipts)</option>
          </select>
        </div>

        {/* 5. Voice ID picker */}
        <div className="space-y-2">
          <p className="font-serif text-base text-[var(--ink)]">Voice</p>
          <p className="font-serif text-sm text-[var(--ink-muted)]">
            Choose a British voice for spoken receipts. Click Play to audition.
          </p>
          <VoiceIdPicker
            value={settings.voiceId}
            onChange={(voiceId) => update({ voiceId })}
            disabled={voiceDisabled || settings.ttsProvider !== "elevenlabs"}
          />
        </div>

        {/* 6. Discreet mode */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-serif text-base text-[var(--ink)]">
              Discreet mode
            </p>
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Silences voice output and disables wake-word. Text Console still
              works.{" "}
              <kbd className="font-mono text-xs bg-[var(--surface-raised)] border border-[var(--edge)] px-1 py-0.5 rounded">
                Cmd+Shift+J
              </kbd>{" "}
              still arms voice on demand.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.discreetMode}
            onClick={() =>
              !voiceDisabled &&
              update({ discreetMode: !settings.discreetMode })
            }
            disabled={voiceDisabled}
            className={cn(
              "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none",
              settings.discreetMode && !voiceDisabled
                ? "bg-[var(--hud-cyan)] border-[var(--hud-cyan)]"
                : "bg-[var(--surface-raised)] border-[var(--edge)]",
              voiceDisabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out",
                settings.discreetMode && !voiceDisabled
                  ? "translate-x-5"
                  : "translate-x-0",
              )}
            />
            <span className="sr-only">
              {settings.discreetMode ? "Disable discreet mode" : "Enable discreet mode"}
            </span>
          </button>
        </div>

        {/* 7. Mic device picker */}
        <div className="space-y-2">
          <label className="block font-serif text-base text-[var(--ink)]">
            Microphone
          </label>
          <p className="font-serif text-sm text-[var(--ink-muted)]">
            Choose the input device for wake-word detection and voice commands.
          </p>
          <MicDevicePicker
            value={settings.micDeviceId}
            onChange={(deviceId) => update({ micDeviceId: deviceId })}
            disabled={voiceDisabled}
          />
        </div>

        <div className="border-t border-[var(--edge)]" />

        {/* 8. Physical Extension Mode — hardware wake-word proxy
            (Arduino + DF2301Q via Node bridge). When ON, the browser
            does not ambiently listen; the mic only acquires when the
            external device fires its wake-word. Cmd+Shift+J PTT still
            works. See tools/jarvis-physical/ for setup. */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <label
              htmlFor="physical-extension-toggle"
              className="block font-serif text-base text-[var(--ink)]"
            >
              Physical Extension Mode
            </label>
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Use an external hardware wake-word device (Arduino + DF2301Q) as
              the trigger. When on, the browser stops ambient listening — the
              mic only acquires when the physical device fires.{" "}
              <kbd className="font-mono text-xs">⌘⇧J</kbd> still works.
            </p>
          </div>
          <input
            id="physical-extension-toggle"
            type="checkbox"
            checked={physicalExtensionEnabled}
            onChange={(e) => setPhysicalExtensionEnabled(e.target.checked)}
            className="h-5 w-5 cursor-pointer"
            aria-label="Toggle physical extension mode"
          />
        </div>
      </Card>

      {/* EnableVoiceModal — opened on OFF→ON transition */}
      <EnableVoiceModal
        open={modalOpen}
        hasHeardWelcome={settings.hasHeardWelcome}
        onEnabled={handleModalEnabled}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
}
