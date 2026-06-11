// JARVIS mobile main screen. One central orb: tap to dictate, tap again to
// send. The server transcribes (Groq), runs the JARVIS turn, and streams the
// response over the physical SSE bus — the same pipeline as the desktop app.
// A text bar underneath covers the can't-talk-right-now case via
// /api/jarvis/voice/text.

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
import { Orb, type OrbState } from "../components/Orb";
import { SettingsSheet } from "../components/SettingsSheet";
import { TextBar } from "../components/TextBar";
import { postText, postTranscript } from "../lib/api";
import { getDeviceToken, getSettings, loadSettings, onSettingsChange } from "../lib/settings";
import { splitDeltas } from "../lib/sentence-splitter";
import { subscribeJarvisEvents, type SseStatus } from "../lib/sse";
import { colors, mono } from "../theme";

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

const STATUS_LABEL: Record<OrbState, string> = {
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
  const [paired, setPaired] = useState(false);

  const recorder = useVoiceRecorder();
  const scrollRef = useRef<ScrollView>(null);

  const ttsQueue = useRef(new TtsQueue()).current;
  const sentenceBuffer = useRef("");
  const sentenceSeq = useRef(0);
  const turnDone = useRef(true);
  const orbStateRef = useRef<OrbState>("idle");
  orbStateRef.current = orbState;

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
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, text: last.text + delta };
      }
      return next;
    });
  }, []);

  // SSE subscription — re-opened whenever settings are saved (server URL or
  // token may have changed) via the settings sheet closing.
  useEffect(() => {
    if (!ready || settingsOpen) return;
    return subscribeJarvisEvents({
      onStatus: setSseStatus,
      onResponseStart: () => {
        turnDone.current = false;
        sentenceBuffer.current = "";
        sentenceSeq.current = 0;
        ttsQueue.resetTurn();
        setTurns((prev) => [
          ...prev.slice(-19),
          { id: `a-${Date.now()}`, role: "assistant", text: "", actions: [] },
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
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, actions: [...last.actions, { toolUseId, name }] };
          }
          return next;
        });
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
    setTurns((prev) => [
      ...prev.slice(-19),
      { id: `u-${Date.now()}`, role: "user", text, actions: [] },
    ]);
  }, []);

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
      setOrbState("transcribing");
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

    // idle → start recording
    ttsQueue.stop();
    const started = await recorder.start();
    if (started) {
      setOrbState("recording");
    }
  }, [recorder, ttsQueue, pushUserTurn]);

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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerSide} />
        <Text style={styles.title}>J.A.R.V.I.S.</Text>
        <View style={[styles.headerSide, { alignItems: "flex-end" }]}>
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12}>
            <Text style={styles.gear}>⚙︎</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.dot,
            { backgroundColor: sseStatus === "connected" ? colors.accent : colors.upload },
          ]}
        />
        <Text style={styles.statusText}>
          {sseStatus === "connected" ? "link active" : sseStatus}
          {!paired ? "  ·  unpaired — open settings" : ""}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.conversation}
        contentContainerStyle={styles.conversationContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {turns.map((turn) => (
          <View
            key={turn.id}
            style={[styles.turn, turn.role === "user" ? styles.turnUser : styles.turnAssistant]}
          >
            <Text style={turn.role === "user" ? styles.turnUserText : styles.turnAssistantText}>
              {turn.text || "…"}
            </Text>
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

      <View style={styles.orbZone}>
        <Orb state={orbState} onPress={() => void handleOrbPress()} />
        <Text style={styles.orbHint}>{STATUS_LABEL[orbState]}</Text>
      </View>

      <View style={{ paddingBottom: insets.bottom + 8 }}>
        <TextBar disabled={!ready} onSubmit={(text) => void handleText(text)} />
      </View>

      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  headerSide: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontFamily: mono,
    fontSize: 15,
    letterSpacing: 6,
  },
  gear: {
    color: colors.textDim,
    fontSize: 20,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 6,
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
  conversation: {
    flex: 1,
    marginTop: 10,
  },
  conversationContent: {
    paddingHorizontal: 20,
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
  turnUserText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  turnAssistantText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
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
  orbZone: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  orbHint: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
  },
});
