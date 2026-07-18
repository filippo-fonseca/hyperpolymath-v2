/**
 * SettingsWidget — the HUD's ONE settings surface.
 *
 * Until now there were two, and the split was the bug: this widget held 7
 * preferences, while a legacy DOM drawer (`<section id="settings">`) held the
 * other 11 — the device token, every voice/capture control, wake, and the whole
 * startup sequence. That drawer was CSS-gated to `body[data-sse="error"]` and
 * opened only by clicking the disconnect banner, so while JARVIS was HEALTHY
 * most of its own settings did not exist to the user. The gear was rebound here
 * without the controls ever following.
 *
 * This surface is the union, sectioned: Connection, Voice, Hand tracking,
 * Startup, WhatsApp, Notifications, Appearance. The disconnected state renders
 * INSIDE Connection as an inline status row rather than as a separate screen
 * reached a different way.
 *
 * Three things worth knowing before editing:
 *
 * - **Two backends, deliberately.** The tauri plugin-store keys go through
 *   {@link ../state/desktop-settings} (async, `saveSetting`); the HUD prefs go
 *   through {@link ../state/hud-settings} (sync, localStorage). No key was
 *   migrated between them — a move without a read-old-then-write-new step
 *   would silently reset live values to defaults.
 * - **Live-apply is not automatic.** Flipping a setting must also DO the thing
 *   (start the wake listener, re-register the shortcut, retune the VAD). Those
 *   effects hang off seams main.ts registers via `setSettingsEffects`; see that
 *   module's header. An unwired seam degrades to persist-only, not to a crash.
 * - **Startup is web-authoritative** and says so inline. See the Startup
 *   section's note.
 */

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

import { invoke } from "@tauri-apps/api/core";

import { getDeviceToken, setDeviceToken } from "@/auth/device-token";
import { type StartupOpenItem } from "@/settings";

import { SD_FONT, SD_INK } from "../tokens";
import { setHandEnabled, useHandTracking } from "../input/hand-status";
import {
  hydrateDesktopSettings,
  notifyDeviceTokenCleared,
  notifyDeviceTokenSaved,
  requestStopSpeaking,
  setManualMode,
  setPhysicalExtenderEnabled,
  setStartupBriefingEnabled,
  setStartupOpenOnStart,
  setStartupShortcuts,
  setTtsEnabled,
  setTtsProvider,
  setTtsVoiceId,
  setVadSilenceMs,
  setWakeEnabled,
  setWhatsappBridgeUrl,
  useDesktopSettings,
} from "../state/desktop-settings";
import { useHudStatus } from "../state/hud-status";
import {
  hydrateHudSettings,
  setBackgroundEnabled,
  setMessageAutoReadEnabled,
  setMessageNotificationsEnabled,
  setMotionMode,
  setSoundEnabled,
  useHudSettings,
  type MotionMode,
} from "../state/hud-settings";
import {
  Button,
  Note,
  Row,
  Section,
  Segments,
  Select,
  StatusRow,
  TextField,
  Toggle,
  TONE_INK,
  type Tone,
} from "./settings/controls";
import { useWhatsappHealth } from "./settings/use-whatsapp-health";

const MOTION_OPTIONS: ReadonlyArray<{ value: MotionMode; label: string }> = [
  { value: "system", label: "Auto" },
  { value: "full", label: "Full" },
  { value: "reduced", label: "Reduced" },
];

const PROVIDER_OPTIONS = [
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "off", label: "Off" },
] as const;

/** The same five windows the legacy `#vad-silence` select offered. */
const VAD_OPTIONS = [
  { value: "800", label: "snappy (0.8s)" },
  { value: "1200", label: "quick (1.2s)" },
  { value: "1500", label: "default (1.5s)" },
  { value: "2000", label: "relaxed (2s)" },
  { value: "2500", label: "patient (2.5s)" },
] as const;

const OPEN_TYPE_OPTIONS = [
  { value: "url", label: "URL" },
  { value: "app", label: "App" },
] as const;

const OPEN_PLACEHOLDER: Record<StartupOpenItem["type"], string> = {
  url: "https://mail.google.com",
  app: "Spotify",
};

const BUNDLE_ID = "io.hyperpolymath.jarvis-desktop";

// ── Connection ───────────────────────────────────────────────────────────────

const SSE_TONE: Record<string, Tone> = { open: "ok", connecting: "warn", error: "err" };

/**
 * Device token field. The ONLY path to fix a bad token used to be the
 * disconnect banner; it now lives here, and the banner summons this surface.
 * Save reconnects the SSE stream and resyncs routines so recovery is immediate.
 */
function TokenControl(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getDeviceToken().then((value) => {
      if (alive) setToken(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (raw: string): Promise<void> => {
    const value = raw.trim();
    if (!value) return;
    if (!value.startsWith("hpd_")) {
      setError("invalid token — expected one starting with hpd_");
      return;
    }
    try {
      await setDeviceToken(value);
    } catch {
      setError("could not write the token to disk");
      return;
    }
    setError(null);
    setToken(value);
    setDraft("");
    notifyDeviceTokenSaved();
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    try {
      await setDeviceToken(null);
    } catch {
      setError("could not clear the token");
      return;
    }
    setError(null);
    setToken(null);
    notifyDeviceTokenCleared();
  }, []);

  const openMintPage = useCallback(async (): Promise<void> => {
    try {
      const { apiBaseUrl } = (await import("@/env")).getEnv();
      window.open(`${apiBaseUrl}/settings/desktop`, "_blank");
    } catch {
      setError("could not resolve the server URL");
    }
  }, []);

  const status: { text: string; tone: Tone } = error
    ? { text: error, tone: "err" }
    : token
      ? { text: `✓ ${token.slice(0, 8)}…`, tone: "ok" }
      : { text: "unauthenticated — paste a token below", tone: "muted" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span
        style={{
          color: TONE_INK[status.tone],
          fontFamily: SD_FONT.mono,
          fontSize: 11,
          letterSpacing: "0.04em",
        }}
      >
        {status.text}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="password"
          value={draft}
          aria-label="Device token"
          placeholder="hpd_..."
          onChange={(e) => setDraft(e.target.value)}
          // Auto-save on paste so the user doesn't have to chase a second
          // button. The timeout lets the pasted text land in `value` first.
          onPaste={() => {
            setTimeout(() => {
              setDraft((current) => {
                void save(current);
                return current;
              });
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save(draft);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 9px",
            border: `1px solid hsl(235 15% 23%)`,
            borderRadius: 6,
            background: "hsl(235 15% 20%)",
            color: SD_INK.base,
            fontFamily: SD_FONT.mono,
            fontSize: 11,
            outline: "none",
          }}
        />
        <Button onClick={() => void save(draft)}>Save</Button>
        <Button onClick={() => void clear()} tone="err">
          Clear
        </Button>
      </div>
      <Button onClick={() => void openMintPage()}>Mint a token →</Button>
    </div>
  );
}

function ConnectionSection(): React.ReactElement {
  const { sse, sseDetail } = useHudStatus();
  return (
    <Section title="Connection & account" id="settings-connection">
      <StatusRow label="JARVIS server" value={sseDetail} tone={SSE_TONE[sse] ?? "muted"} />
      {sse === "error" ? (
        <Note>
          Disconnected from the JARVIS server. The device token below is the usual cause: paste a
          fresh one to reconnect. Nothing else needs restarting.
        </Note>
      ) : null}
      <Row
        label="Device token"
        hint="Minted on the web at /settings/desktop and pasted here once."
        control={<TokenControl />}
        stack
      />
      <StatusRow label="Bundle ID" value={BUNDLE_ID} />
    </Section>
  );
}

// ── Voice ────────────────────────────────────────────────────────────────────

function VoiceSection(): React.ReactElement {
  const { settings } = useDesktopSettings();
  const { mode, hotkey, speaking } = useHudStatus();

  return (
    <Section title="Voice" id="settings-voice">
      <Row
        label="Speak responses"
        hint="Read JARVIS's replies aloud"
        control={
          <Toggle on={settings.ttsEnabled} onChange={setTtsEnabled} label="Toggle spoken replies" />
        }
      />
      <Row
        label="Voice provider"
        control={
          <Select
            value={settings.ttsProvider}
            options={PROVIDER_OPTIONS}
            onChange={setTtsProvider}
            label="Voice provider"
          />
        }
      />
      <Row
        label="Voice"
        hint="ElevenLabs voice ID. The default is George."
        control={
          <TextField
            value={settings.ttsVoiceId}
            onCommit={setTtsVoiceId}
            label="ElevenLabs voice ID"
            placeholder="JBFqnCBsd6RMkjVDRZzb"
          />
        }
        stack
      />
      <Row
        label="Speaking"
        control={
          speaking ? (
            <Button onClick={requestStopSpeaking}>Stop speaking</Button>
          ) : (
            <span style={{ color: SD_INK.faint, fontFamily: SD_FONT.mono, fontSize: 11 }}>
              idle
            </span>
          )
        }
      />
      <Row
        label="Manual mode"
        hint="Every turn starts open-mic — only this toggle or ⌘⌃E closes it"
        control={
          <Toggle on={settings.manualMode} onChange={setManualMode} label="Toggle manual mode" />
        }
      />
      <Row
        label="Silence wait"
        hint="Silence before JARVIS decides your turn ended"
        control={
          <Select
            value={String(settings.vadSilenceMs) as (typeof VAD_OPTIONS)[number]["value"]}
            options={VAD_OPTIONS}
            onChange={(value) => setVadSilenceMs(Number(value))}
            label="Silence wait"
          />
        }
      />
      <Row
        label="Physical Extender"
        hint="Respond to trigger events pushed from the server"
        control={
          <Toggle
            on={settings.physicalExtenderEnabled}
            onChange={setPhysicalExtenderEnabled}
            label="Toggle Physical Extender"
          />
        }
      />
      <StatusRow label="Mode" value={mode} />
      <StatusRow label="Hotkey" value={hotkey} />
    </Section>
  );
}

// ── Hand tracking ────────────────────────────────────────────────────────────

function HandTrackingSection(): React.ReactElement {
  const { enabled, status } = useHandTracking();
  return (
    <Section title="Hand tracking" id="settings-hand">
      <Row
        label="Hand cursor"
        hint="Webcam gesture pointer · ⌘⇧H"
        control={<Toggle on={enabled} onChange={setHandEnabled} label="Toggle hand cursor" />}
      />
      <StatusRow
        label="Camera"
        value={status.state}
        tone={status.state === "running" ? "ok" : status.state === "error" ? "err" : "muted"}
      />
    </Section>
  );
}

// ── Startup ──────────────────────────────────────────────────────────────────

/** Editor for the openOnStart list. Draft-owned while editing so an in-progress
 *  empty row survives the store round-trip that filters empties out. */
function OpenOnStartEditor(): React.ReactElement {
  const { status, settings } = useDesktopSettings();
  const [rows, setRows] = useState<StartupOpenItem[]>(settings.startupOpenOnStart);

  // Resync only when hydration lands, never on every write — a write echoes the
  // FILTERED value back, which would delete the blank row just added.
  useEffect(() => {
    if (status !== "loading") setRows(settings.startupOpenOnStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const commit = (next: StartupOpenItem[]): void => {
    setRows(next);
    // Empty rows stay visible for editing but never reach the store.
    setStartupOpenOnStart(next.filter((item) => item.value.trim().length > 0));
  };

  return (
    <ListEditor
      empty="Nothing opens on start."
      onAdd={() => setRows([...rows, { type: "url", value: "" }])}
      rows={rows.map((item, index) => (
        <React.Fragment key={index}>
          <Select
            value={item.type}
            options={OPEN_TYPE_OPTIONS}
            onChange={(type) =>
              commit(rows.map((r, i) => (i === index ? { ...r, type } : r)))
            }
            label="Open on start type"
          />
          <TextField
            value={item.value}
            placeholder={OPEN_PLACEHOLDER[item.type]}
            onCommit={(value) =>
              commit(rows.map((r, i) => (i === index ? { ...r, value } : r)))
            }
            label="Open on start value"
          />
          <Button onClick={() => commit(rows.filter((_, i) => i !== index))} label="Remove">
            ✕
          </Button>
        </React.Fragment>
      ))}
    />
  );
}

function ShortcutsEditor(): React.ReactElement {
  const { status, settings } = useDesktopSettings();
  const [rows, setRows] = useState<string[]>(settings.startupShortcuts);

  useEffect(() => {
    if (status !== "loading") setRows(settings.startupShortcuts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const commit = (next: string[]): void => {
    setRows(next);
    setStartupShortcuts(next.filter((name) => name.trim().length > 0));
  };

  return (
    <ListEditor
      empty="No Shortcuts run on start."
      onAdd={() => setRows([...rows, ""])}
      rows={rows.map((name, index) => (
        <React.Fragment key={index}>
          <TextField
            value={name}
            placeholder="Shortcut name (as in the Shortcuts app)"
            onCommit={(value) => commit(rows.map((r, i) => (i === index ? value : r)))}
            label="Startup Shortcut name"
          />
          <Button onClick={() => commit(rows.filter((_, i) => i !== index))} label="Remove">
            ✕
          </Button>
        </React.Fragment>
      ))}
    />
  );
}

function ListEditor({
  rows,
  onAdd,
  empty,
}: {
  rows: React.ReactNode[];
  onAdd: () => void;
  empty: string;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.length === 0 ? (
        <span style={{ color: SD_INK.faint, fontFamily: SD_FONT.sans, fontSize: 11 }}>{empty}</span>
      ) : (
        rows.map((row, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {row}
          </div>
        ))
      )}
      <div>
        <Button onClick={onAdd}>+ Add</Button>
      </div>
    </div>
  );
}

function StartupSection(): React.ReactElement {
  const { settings } = useDesktopSettings();
  return (
    <Section title="Startup" id="settings-startup">
      <Row
        label="Wake word"
        hint='Idle listener for "daddy&apos;s home"'
        control={<Toggle on={settings.wakeEnabled} onChange={setWakeEnabled} label="Toggle wake word" />}
      />
      <Note>
        Wake word mode keeps your microphone open at all times so JARVIS can listen for your phrase.
        macOS will show the green mic indicator continuously while this is on. Short audio snippets
        are sent to your private JARVIS server for wake-phrase detection; fully on-device detection
        is planned.
      </Note>
      <Row
        label="Briefing"
        hint="Speak a proactive briefing on the first invoke of each session"
        control={
          <Toggle
            on={settings.startupBriefingEnabled}
            onChange={setStartupBriefingEnabled}
            label="Toggle startup briefing"
          />
        }
      />
      <Row label="Open on start" control={<OpenOnStartEditor />} stack />
      <Row label="Startup Shortcuts" control={<ShortcutsEditor />} stack />
      <Note>
        Your JARVIS server is authoritative for these three: at session start the desktop fetches
        them from the web and mirrors the result down, so a value set on the web wins over one set
        here. Edits here persist locally and are used when the server is unreachable. Set them on
        the web to make them stick everywhere.
      </Note>
    </Section>
  );
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

function WhatsappSection(): React.ReactElement {
  const { settings } = useDesktopSettings();
  const [busy, setBusy] = useState(false);
  const { status, refresh } = useWhatsappHealth(settings.whatsappBridgeUrl, busy);

  const relinking = status.action === "relink";

  const reconnect = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      // Idempotent on the bridge side, so a double-click is safe.
      await invoke<string>("whatsapp_reconnect", {
        bridgeUrl: settings.whatsappBridgeUrl.replace(/\/$/, ""),
      });
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.warn("[settings] whatsapp reconnect failed", err);
    } finally {
      setBusy(false);
      refresh();
    }
  }, [settings.whatsappBridgeUrl, refresh]);

  return (
    <Section title="WhatsApp" id="settings-whatsapp">
      <StatusRow
        label="Status"
        value={busy ? (relinking ? "re-pairing — scan the QR" : "reconnecting…") : status.text}
        tone={busy ? "warn" : status.tone}
      />
      <Row
        label="Connection"
        control={
          <Button onClick={() => void reconnect()} disabled={busy}>
            {busy
              ? relinking
                ? "Re-linking…"
                : "Reconnecting…"
              : relinking
                ? "Re-link (scan QR)"
                : "Reconnect"}
          </Button>
        }
      />
      <Note>
        Re-pairs WhatsApp: logs out the linked device and shows a fresh QR to scan (WhatsApp →
        Linked Devices).
      </Note>
      <Row
        label="Bridge URL"
        hint="Where the local WhatsApp bridge listens"
        control={
          <TextField
            value={settings.whatsappBridgeUrl}
            onCommit={setWhatsappBridgeUrl}
            label="WhatsApp bridge URL"
            placeholder="http://localhost:8080"
          />
        }
        stack
      />
    </Section>
  );
}

// ── Notifications + Appearance ───────────────────────────────────────────────

function NotificationsSection(): React.ReactElement {
  const { soundEnabled, messageNotificationsEnabled, messageAutoReadEnabled } = useHudSettings();
  return (
    <Section title="Notifications" id="settings-notifications">
      <Row
        label="Message notifications"
        hint="Announce incoming WhatsApp + iMessage · toast + open the chat"
        control={
          <Toggle
            on={messageNotificationsEnabled}
            onChange={setMessageNotificationsEnabled}
            label="Toggle message notifications"
          />
        }
      />
      <Row
        label="Auto-read aloud"
        hint="Speak new messages in JARVIS's voice as they arrive"
        control={
          <Toggle
            on={messageAutoReadEnabled}
            onChange={setMessageAutoReadEnabled}
            label="Toggle auto-read aloud"
          />
        }
      />
      <Row
        label="Sound"
        hint="Widget drop pop and message-send cue"
        control={<Toggle on={soundEnabled} onChange={setSoundEnabled} label="Toggle UI sounds" />}
      />
    </Section>
  );
}

function AppearanceSection(): React.ReactElement {
  const { backgroundEnabled, motionMode } = useHudSettings();
  return (
    <Section title="Appearance" id="settings-appearance">
      <Row
        label="Ambient background"
        hint="Drifting constellation graph behind the stage"
        control={
          <Toggle
            on={backgroundEnabled}
            onChange={setBackgroundEnabled}
            label="Toggle ambient background"
          />
        }
      />
      <Row
        label="Motion"
        hint="Override the system reduced-motion preference"
        control={
          <Segments
            value={motionMode}
            options={MOTION_OPTIONS}
            onChange={setMotionMode}
            label="Motion"
          />
        }
      />
    </Section>
  );
}

// ── Surface ──────────────────────────────────────────────────────────────────

export default function SettingsWidget(): React.ReactElement {
  useEffect(() => {
    hydrateHudSettings();
    void hydrateDesktopSettings();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        overflowY: "auto",
      }}
    >
      <ConnectionSection />
      <VoiceSection />
      <HandTrackingSection />
      <StartupSection />
      <WhatsappSection />
      <NotificationsSection />
      <AppearanceSection />
    </div>
  );
}
