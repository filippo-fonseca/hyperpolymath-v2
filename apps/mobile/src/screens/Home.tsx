// JARVIS mobile main screen.
//
// Layout has two modes:
//   • Empty conversation — the orb sits dead-center, Shazam-style, with the
//     text bar at the bottom.
//   • Active conversation (≥1 turn) — the orb docks to the header top-left
//     (same glyph, same animations, smaller) and the conversation fills the
//     screen.
// Tapping the orb (either position) opens a full-screen dictation overlay:
// big orb, scrim behind it, cancel button. Send or cancel collapses it back.

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useVoiceRecorder } from "../audio/recorder";
import { TtsQueue } from "../audio/tts-queue";
import { GearIcon, KiwiMark } from "../components/icons";
import { Orb, type OrbState } from "../components/Orb";
import { SettingsSheet } from "../components/SettingsSheet";
import { TextBar } from "../components/TextBar";
import { VoiceOverlay } from "../components/VoiceOverlay";
import { postText, postTranscript } from "../lib/api";
import { getDeviceToken, getSettings, loadSettings, onSettingsChange } from "../lib/settings";
import { splitDeltas } from "../lib/sentence-splitter";
import { subscribeJarvisEvents, type SseStatus } from "../lib/sse";
import { colors, mono, serif, serifSemiBold } from "../theme";

interface ActionChip {
  toolUseId: string;
  name: string;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: ActionChip[];
}

const CENTER_HINT: Record<OrbState, string> = {
  idle: "tap to speak",
  recording: "listening — tap to send",
  transcribing: "transcribing…",
  thinking: "thinking…",
  speaking: "speaking",
};

export function Home() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sseStatus, setSseStatus] = useState<SseStatus>("connecting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [paired, setPaired] = useState(false);

  const recorder = useVoiceRecorder();
  const scrollRef = useRef<ScrollView>(null);

  const ttsQueue = useRef(new TtsQueue()).current;
  const sentenceBuffer = useRef("");
  const sentenceSeq = useRef(0);
  const turnDone = useRef(true);
  const activeAssistantId = useRef<string | null>(null);
  const orbStateRef = useRef<OrbState>("idle");
  orbStateRef.current = orbState;

  const hasConversation = turns.length > 0;

  useEffect(() => {
    void loadSettings().then((s) => {
      ttsQueue.setEnabled(s.ttsEnabled);
      ttsQueue.setVoiceId(s.voiceId);
      setPaired(Boolean(getDeviceToken()));
      setReady(true);
    });
    return onSettingsChange((s) => {
      ttsQueue.setEnabled(s.ttsEnabled);
      ttsQueue.setVoiceId(s.voiceId);
    });
  }, [ttsQueue]);

  // When the TTS queue drains and the turn has ended, return to idle.
  useEffect(() => {
    return ttsQueue.onStateChange((state) => {
      if (state === "playing") {
        setOrbState("speaking");
      } else if (turnDone.current && orbStateRef.current === "speaking") {
        setOrbState("idle");
      }
    });
  }, [ttsQueue]);

  const appendAssistantDelta = useCallback((delta: string) => {
    const id = activeAssistantId.current;
    if (!id) return;
    setTurns((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text: t.text + delta } : t)),
    );
  }, []);

  // SSE subscription — re-opened whenever settings are saved (server URL or
  // token may have changed) via the settings sheet closing.
  useEffect(() => {
    if (!ready || settingsOpen) return;
    return subscribeJarvisEvents({
      onStatus: setSseStatus,
      onResponseStart: ({ turnId }) => {
        turnDone.current = false;
        sentenceBuffer.current = "";
        sentenceSeq.current = 0;
        ttsQueue.resetTurn();
        const id = `a-${turnId}`;
        activeAssistantId.current = id;
        setTurns((prev) => [
          ...prev.slice(-19),
          { id, role: "assistant", text: "", actions: [] },
        ]);
        setOrbState((s) => (s === "speaking" ? s : "thinking"));
      },
      onResponseChunk: ({ delta }) => {
        appendAssistantDelta(delta);
        const { sentences, remainder } = splitDeltas(sentenceBuffer.current, delta);
        sentenceBuffer.current = remainder;
        for (const sentence of sentences) {
          ttsQueue.enqueueSentence(sentence, sentenceSeq.current++);
        }
      },
      onToolCall: ({ toolUseId, name }) => {
        const id = activeAssistantId.current;
        if (!id) return;
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, actions: [...t.actions, { toolUseId, name }] } : t,
          ),
        );
      },
      onResponseEnd: () => {
        turnDone.current = true;
        const tail = sentenceBuffer.current.trim();
        sentenceBuffer.current = "";
        if (tail) ttsQueue.enqueueSentence(tail, sentenceSeq.current++);
        if (!getSettings().ttsEnabled) {
          setOrbState("idle");
        } else {
          // If nothing is (or will be) playing, settle back to idle.
          setTimeout(() => {
            if (turnDone.current && orbStateRef.current === "thinking") setOrbState("idle");
          }, 800);
        }
      },
    });
  }, [ready, settingsOpen, appendAssistantDelta, ttsQueue]);

  useEffect(() => {
    if (!settingsOpen) setPaired(Boolean(getDeviceToken()));
  }, [settingsOpen]);

  const pushUserTurn = useCallback((text: string) => {
    const userTurn: Turn = { id: `u-${Date.now()}`, role: "user", text, actions: [] };
    setTurns((prev) => {
      const activeId = activeAssistantId.current;
      const idx = !turnDone.current && activeId ? prev.findIndex((t) => t.id === activeId) : -1;
      const next =
        idx >= 0
          ? [...prev.slice(0, idx), userTurn, ...prev.slice(idx)]
          : [...prev, userTurn];
      return next.slice(-20);
    });
  }, []);

  /** Orb tap — anywhere it appears. */
  const handleOrbPress = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (orbStateRef.current === "speaking") {
      ttsQueue.stop();
      setOrbState("idle");
      return;
    }
    if (orbStateRef.current === "transcribing" || orbStateRef.current === "thinking") {
      return; // a turn is in flight
    }

    if (orbStateRef.current === "recording") {
      // Send: stop capture, close the overlay, upload.
      setOrbState("transcribing");
      setOverlayOpen(false);
      const capture = await recorder.stop();
      if (!capture) {
        setOrbState("idle");
        return;
      }
      const result = await postTranscript(capture);
      if (!result) {
        setOrbState("idle");
        pushUserTurn("⚠︎ couldn't reach JARVIS — check settings");
        return;
      }
      pushUserTurn(result.transcript);
      setOrbState("thinking");
      return;
    }

    // idle → open the dictation overlay and start recording
    ttsQueue.stop();
    const started = await recorder.start();
    if (started) {
      setOrbState("recording");
      setOverlayOpen(true);
    }
  }, [recorder, ttsQueue, pushUserTurn]);

  /** Cancel button in the overlay — discard the capture, send nothing. */
  const handleCancel = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOverlayOpen(false);
    setOrbState("idle");
    await recorder.cancel();
  }, [recorder]);

  const handleText = useCallback(
    async (text: string) => {
      pushUserTurn(text);
      setOrbState("thinking");
      const result = await postText(text);
      if (!result) {
        setOrbState("idle");
        pushUserTurn("⚠︎ couldn't reach JARVIS — check settings");
      }
    },
    [pushUserTurn],
  );

  const online = sseStatus === "connected";

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header: docked orb (when conversing) · logo + status · settings */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerLeft}>
            {hasConversation ? (
              <Orb state={orbState} size={48} onPress={() => void handleOrbPress()} />
            ) : (
              <KiwiMark size={26} />
            )}
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.brand}>HYPERPOLYMATH</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: online ? colors.accent : colors.upload },
                ]}
              />
              <Text style={styles.statusText}>
                {online ? "JARVIS online" : sseStatus === "connecting" ? "connecting…" : "reconnecting…"}
                {!paired ? " · unpaired" : ""}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => setSettingsOpen(true)}
              hitSlop={14}
              style={({ pressed }) => [styles.gearButton, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <GearIcon size={26} />
            </Pressable>
          </View>
        </View>

        {/* Body */}
        {hasConversation ? (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.conversationContent}
            keyboardDismissMode="interactive"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {turns.map((turn) => (
              <View
                key={turn.id}
                style={[styles.turn, turn.role === "user" ? styles.turnUser : styles.turnAssistant]}
              >
                <Text style={styles.turnText}>{turn.text || "…"}</Text>
                {turn.actions.length > 0 && (
                  <View style={styles.chips}>
                    {turn.actions.map((a) => (
                      <View key={a.toolUseId} style={styles.chip}>
                        <Text style={styles.chipText}>{a.name.replace(/_/g, " ")}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.centerStage}>
            <Orb state={orbState} size={250} onPress={() => void handleOrbPress()} />
            <Text style={styles.centerHint}>{CENTER_HINT[orbState]}</Text>
          </View>
        )}

        {/* Text bar pinned to the bottom; KeyboardAvoidingView lifts it. */}
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <TextBar disabled={!ready} onSubmit={(text) => void handleText(text)} />
        </View>
      </KeyboardAvoidingView>

      <VoiceOverlay
        visible={overlayOpen}
        state={orbState}
        onOrbPress={() => void handleOrbPress()}
        onCancel={() => void handleCancel()}
      />

      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    minHeight: 56,
  },
  headerLeft: {
    width: 56,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  headerRight: {
    width: 56,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  brand: {
    color: colors.text,
    fontFamily: serifSemiBold,
    fontSize: 17,
    letterSpacing: 3,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  centerHint: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
  },
  conversationContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  turn: {
    maxWidth: "88%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  turnUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(0, 212, 255, 0.10)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  turnAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  turnText: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 17,
    lineHeight: 24,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
  },
});
