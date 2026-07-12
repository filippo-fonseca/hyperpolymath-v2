/**
 * SettingsWidget — the HUD's small, glass-register settings sheet.
 *
 * Hairline-sectioned rows in the wiki chrome idiom (mono uppercase micro-labels,
 * sans body): the hand-cursor toggle, a read-only TTS voice line, the ambient
 * background on/off, and the reduced-motion override. It writes the persisted
 * {@link ../state/hud-settings} store and the hand-tracking store directly, so a
 * flip takes effect live without a reload.
 */

import * as React from "react";
import { useEffect, useState, type CSSProperties } from "react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { setHandEnabled, useHandTracking } from "../input/hand-status";
import {
  hydrateHudSettings,
  setBackgroundEnabled,
  setMessageAutoReadEnabled,
  setMessageNotificationsEnabled,
  setMotionMode,
  useHudSettings,
  type MotionMode,
} from "../state/hud-settings";

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "11px 14px",
  borderTop: `1px solid ${STUDIO_COLORS.rule}`,
};

const labelStyle: CSSProperties = {
  margin: 0,
  color: STUDIO_COLORS.text,
  fontFamily: STUDIO_MONO,
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const hintStyle: CSSProperties = {
  margin: "3px 0 0",
  color: STUDIO_COLORS.muted,
  fontSize: 11,
  lineHeight: 1.35,
};

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="studio-chrome-btn"
      style={{
        position: "relative",
        width: 40,
        height: 22,
        flexShrink: 0,
        padding: 0,
        border: `1px solid ${on ? STUDIO_COLORS.accent : STUDIO_COLORS.rule}`,
        borderRadius: 11,
        background: on
          ? `color-mix(in srgb, ${STUDIO_COLORS.accent} 22%, transparent)`
          : "transparent",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? STUDIO_COLORS.accent : STUDIO_COLORS.muted,
          transition: "left 160ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      />
    </button>
  );
}

const MOTION_OPTIONS: ReadonlyArray<{ value: MotionMode; label: string }> = [
  { value: "system", label: "Auto" },
  { value: "full", label: "Full" },
  { value: "reduced", label: "Reduced" },
];

function MotionSegments({
  value,
  onChange,
}: {
  value: MotionMode;
  onChange: (mode: MotionMode) => void;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="Motion"
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        border: `1px solid ${STUDIO_COLORS.rule}`,
        borderRadius: 7,
      }}
    >
      {MOTION_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className="studio-chrome-btn"
            style={{
              padding: "4px 9px",
              border: 0,
              borderRadius: 5,
              color: active ? STUDIO_COLORS.accent : STUDIO_COLORS.muted,
              background: active
                ? `color-mix(in srgb, ${STUDIO_COLORS.accent} 16%, transparent)`
                : "transparent",
              fontFamily: STUDIO_MONO,
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Lazily reads the tauri-store TTS settings for a read-only voice line. */
function useTtsInfo(): { enabled: boolean; voiceId: string } | null {
  const [info, setInfo] = useState<{ enabled: boolean; voiceId: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { loadSettings } = await import("@/settings");
        const settings = await loadSettings();
        if (alive) {
          setInfo({ enabled: settings.ttsEnabled, voiceId: settings.ttsVoiceId });
        }
      } catch {
        // No tauri store (web/test): leave the voice line blank.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

export default function SettingsWidget(): React.ReactElement {
  const { enabled: handEnabled } = useHandTracking();
  const {
    backgroundEnabled,
    motionMode,
    messageNotificationsEnabled,
    messageAutoReadEnabled,
  } = useHudSettings();
  const tts = useTtsInfo();

  useEffect(() => {
    hydrateHudSettings();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      <header style={{ padding: "13px 14px 11px" }}>
        <h2
          style={{
            margin: 0,
            color: STUDIO_COLORS.muted,
            fontFamily: STUDIO_MONO,
            fontSize: 9,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          Settings
        </h2>
      </header>

      <div style={rowStyle}>
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Hand cursor</p>
          <p style={hintStyle}>Webcam gesture pointer · ⌘⇧H</p>
        </div>
        <Toggle on={handEnabled} onChange={setHandEnabled} label="Toggle hand cursor" />
      </div>

      <div style={rowStyle}>
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Ambient background</p>
          <p style={hintStyle}>Drifting constellation graph behind the stage</p>
        </div>
        <Toggle
          on={backgroundEnabled}
          onChange={setBackgroundEnabled}
          label="Toggle ambient background"
        />
      </div>

      <div style={rowStyle}>
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Motion</p>
          <p style={hintStyle}>Override the system reduced-motion preference</p>
        </div>
        <MotionSegments value={motionMode} onChange={setMotionMode} />
      </div>

      <div style={rowStyle}>
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Message notifications</p>
          <p style={hintStyle}>Announce incoming WhatsApp + iMessage · toast + open the chat</p>
        </div>
        <Toggle
          on={messageNotificationsEnabled}
          onChange={setMessageNotificationsEnabled}
          label="Toggle message notifications"
        />
      </div>

      <div style={rowStyle}>
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Auto-read aloud</p>
          <p style={hintStyle}>Speak new messages in JARVIS's voice as they arrive</p>
        </div>
        <Toggle
          on={messageAutoReadEnabled}
          onChange={setMessageAutoReadEnabled}
          label="Toggle auto-read aloud"
        />
      </div>

      <div style={rowStyle}>
        <div style={{ minWidth: 0 }}>
          <p style={labelStyle}>Voice</p>
          <p style={hintStyle}>
            {tts
              ? tts.enabled
                ? `TTS on · ${tts.voiceId}`
                : "TTS off"
              : "TTS voice"}
          </p>
        </div>
      </div>
    </div>
  );
}
