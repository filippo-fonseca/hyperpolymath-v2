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

import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { startLiveRecognition, type LiveSession } from "../audio/live-recognition";
import { useVoiceRecorder } from "../audio/recorder";
import { TtsQueue } from "../audio/tts-queue";
import { GearIcon, KiwiMark } from "../components/icons";
import { JarvisReceipt, type ReceiptAction } from "../components/JarvisReceipt";
import { Orb, type OrbState } from "../components/Orb";
import { SettingsSheet } from "../components/SettingsSheet";
import { TextBar, type TextBarSubmit } from "../components/TextBar";
import { VoiceOverlay } from "../components/VoiceOverlay";
import { ClarificationCard, type ClarificationState } from "../components/ClarificationCard";
import { ThinkingWord } from "../components/ThinkingWord";
import { fetchTurn, postText, postTranscript, postUndo, type UndoTarget } from "../lib/api";
import { buildMobileJarvisPayload } from "../lib/input-payload";
import { handlePairUrl } from "../lib/pair-link";
import {
  getJarvisContext,
  refreshJarvisContext,
  type JarvisContext,
} from "../lib/jarvis-context";
import { getDeviceToken, getSettings, loadSettings, onSettingsChange } from "../lib/settings";
import { splitDeltas } from "../lib/sentence-splitter";
import { subscribeJarvisEvents, type SseStatus } from "../lib/sse";
import { emitDataInvalidate } from "../lib/use-collection";
import { colors, mono, serif, serifSemiBold } from "../theme";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: ReceiptAction[];
  /** Assistant turns: stream finished (response-end seen or reconciled). */
  done: boolean;
  clarification?: ClarificationState;
}

const HELP_TEXT = [
  "Commands:",
  "  /task — force task creation",
  "  /capture — force capture creation",
  "  /event — force calendar event",
  "  /ask — ask a question (text reply, no action)",
  "  /help — show this list",
  "",
  "Also: $project links a project, #tag links a hashtag,",
  "p1/p2/p3/ptop sets priority, and dates like “tmrw 5pm” are parsed.",
].join("\n");

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
  const [context, setContext] = useState<JarvisContext>(getJarvisContext());

  const recorder = useVoiceRecorder();
  const [liveTranscript, setLiveTranscript] = useState("");
  const liveSession = useRef<LiveSession | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [sseEpoch, setSseEpoch] = useState(0);
  const ttsQueue = useRef(new TtsQueue()).current;
  const turnsRef = useRef<Turn[]>([]);
  const sentenceBuffer = useRef("");
  const sentenceSeq = useRef(0);
  const turnDone = useRef(true);
  const activeAssistantId = useRef<string | null>(null);
  const orbStateRef = useRef<OrbState>("idle");
  orbStateRef.current = orbState;

  const hasConversation = turns.length > 0;
  turnsRef.current = turns;

  // Pairing deep link (jarvis://pair?token=…&server=…): apply, re-pair,
  // and re-open the SSE subscription against the new server.
  useEffect(() => {
    const apply = async (url: string | null) => {
      if (!url) return;
      if (await handlePairUrl(url)) {
        setPaired(Boolean(getDeviceToken()));
        void refreshJarvisContext().then(setContext);
        setSseEpoch((e) => e + 1);
      }
    };
    void Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener("url", ({ url }) => void apply(url));
    return () => sub.remove();
  }, []);

  // iOS kills idle sockets when the app backgrounds; react-native-sse's
  // auto-reconnect can stall afterwards. Re-open the SSE subscription on
  // every return to foreground (epoch bump re-runs the effect).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setSseEpoch((e) => e + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void loadSettings().then((s) => {
      ttsQueue.setEnabled(s.ttsEnabled);
      ttsQueue.setVoiceId(s.voiceId);
      setPaired(Boolean(getDeviceToken()));
      setReady(true);
      void refreshJarvisContext().then(setContext);
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

  /**
   * Self-healing turn update: events carry the server turnId, so we mutate
   * the matching `a-<turnId>` row wherever it sits — and if response-start
   * was missed (dropped socket), we CREATE the turn on the fly instead of
   * silently discarding chunks/receipts.
   */
  const upsertAssistantTurn = useCallback(
    (turnId: string, mutate: (turn: Turn) => Turn) => {
      const id = `a-${turnId}`;
      setTurns((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = mutate(next[idx]!);
          return next;
        }
        const created = mutate({ id, role: "assistant", text: "", actions: [], done: false });
        return [...prev, created].slice(-20);
      });
    },
    [],
  );

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
        activeAssistantId.current = `a-${turnId}`;
        upsertAssistantTurn(turnId, (t) => t);
        setOrbState((s) => (s === "speaking" ? s : "thinking"));
      },
      onResponseChunk: ({ turnId, delta }) => {
        upsertAssistantTurn(turnId, (t) => ({ ...t, text: t.text + delta }));
        const { sentences, remainder } = splitDeltas(sentenceBuffer.current, delta);
        sentenceBuffer.current = remainder;
        for (const sentence of sentences) {
          ttsQueue.enqueueSentence(sentence, sentenceSeq.current++);
        }
      },
      onToolCall: ({ turnId, toolUseId, name, result }) => {
        // JARVIS just mutated data — nudge the Tasks/Habits/Captures views.
        emitDataInvalidate();
        if (name === "ask_clarification") {
          const receipt =
            ((result as { receipt?: Record<string, unknown> })?.receipt ?? {}) as {
              question?: string;
              options?: string[];
            };
          upsertAssistantTurn(turnId, (t) => ({
            ...t,
            clarification: {
              question: receipt.question ?? "JARVIS needs clarification.",
              options: Array.isArray(receipt.options) ? receipt.options : [],
              answered: false,
            },
          }));
          return;
        }
        upsertAssistantTurn(turnId, (t) => ({
          ...t,
          actions: [...t.actions, { toolUseId, name, result }],
        }));
      },
      onResponseEnd: ({ turnId }) => {
        turnDone.current = true;
        upsertAssistantTurn(turnId, (t) => ({ ...t, done: true }));
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
  }, [ready, settingsOpen, sseEpoch, upsertAssistantTurn, ttsQueue]);

  useEffect(() => {
    if (!settingsOpen) {
      setPaired(Boolean(getDeviceToken()));
      void refreshJarvisContext().then(setContext);
    }
  }, [settingsOpen]);

  /**
   * Reconciliation watchdog: if SSE events were missed, poll the persisted
   * turn until it resolves and back-fill text/receipts. Reconciled text is
   * display-only (never re-spoken).
   */
  const watchTurn = useCallback(
    (turnId: string) => {
      const id = `a-${turnId}`;
      const startedAt = Date.now();
      const interval = setInterval(async () => {
        const local = turnsRef.current.find((t) => t.id === id);
        if (local?.done || Date.now() - startedAt > 90_000) {
          clearInterval(interval);
          return;
        }
        const snapshot = await fetchTurn(turnId);
        if (!snapshot || snapshot.status === "pending") return;
        clearInterval(interval);
        upsertAssistantTurn(turnId, (t) => ({
          ...t,
          text:
            snapshot.status === "error" && !snapshot.text && !t.text
              ? `⚠︎ ${snapshot.errorMessage ?? "turn failed"}`
              : (snapshot.text?.length ?? 0) > t.text.length
                ? (snapshot.text as string)
                : t.text,
          actions:
            (snapshot.actions?.length ?? 0) > t.actions.length
              ? (snapshot.actions as ReceiptAction[]).filter(
                  (a) => a.name !== "ask_clarification",
                )
              : t.actions,
          done: true,
        }));
        turnDone.current = true;
        if (orbStateRef.current === "thinking" || orbStateRef.current === "transcribing") {
          setOrbState("idle");
        }
      }, 2500);
    },
    [upsertAssistantTurn],
  );

  const pushUserTurn = useCallback((text: string) => {
    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      actions: [],
      done: true,
    };
    setTurns((prev) => {
      // Any user send marks open clarifications as answered (web parity:
      // last-question-wins, historical record stays).
      const acked = prev.map((t) =>
        t.clarification && !t.clarification.answered
          ? { ...t, clarification: { ...t.clarification, answered: true } }
          : t,
      );
      const activeId = activeAssistantId.current;
      const idx = !turnDone.current && activeId ? acked.findIndex((t) => t.id === activeId) : -1;
      const next =
        idx >= 0
          ? [...acked.slice(0, idx), userTurn, ...acked.slice(idx)]
          : [...acked, userTurn];
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

      let wav: Uint8Array<ArrayBuffer> | null = null;
      const vadEndAt = Date.now();
      if (liveSession.current) {
        // Live-recognition path: the session persisted a 16kHz WAV.
        const uri = await liveSession.current.stop();
        liveSession.current = null;
        if (uri) {
          try {
            wav = await new File(uri).bytes();
          } catch (err) {
            console.warn("[voice] failed to read live recording", err);
          }
        }
      } else {
        const capture = await recorder.stop();
        if (capture) wav = capture.wav;
      }
      setLiveTranscript("");

      if (!wav || wav.byteLength === 0) {
        setOrbState("idle");
        return;
      }
      const result = await postTranscript({ wav, vadEndAt });
      if (!result) {
        setOrbState("idle");
        pushUserTurn("⚠︎ couldn't reach JARVIS — check settings");
        return;
      }
      pushUserTurn(result.transcript);
      setOrbState("thinking");
      if (result.turnId) watchTurn(result.turnId);
      return;
    }

    // idle → open the dictation overlay and start listening. Prefer the
    // live-recognition path (interim transcript on screen + persisted WAV);
    // fall back to the plain recorder when the native module is absent
    // (Expo Go / pre-1.1.0 binaries).
    ttsQueue.stop();
    setLiveTranscript("");
    const session = await startLiveRecognition(setLiveTranscript);
    if (session) {
      liveSession.current = session;
      setOrbState("recording");
      setOverlayOpen(true);
      return;
    }
    const started = await recorder.start();
    if (started) {
      setOrbState("recording");
      setOverlayOpen(true);
    }
  }, [recorder, ttsQueue, pushUserTurn, watchTurn]);

  /** Cancel button in the overlay — discard the capture, send nothing. */
  const handleCancel = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOverlayOpen(false);
    setOrbState("idle");
    setLiveTranscript("");
    if (liveSession.current) {
      liveSession.current.cancel();
      liveSession.current = null;
      return;
    }
    await recorder.cancel();
  }, [recorder]);

  const handleText = useCallback(
    async ({ text, pinnedCommand }: TextBarSubmit) => {
      const ctx = getJarvisContext();
      const payload = buildMobileJarvisPayload(text, ctx.timezone, ctx.projects, pinnedCommand);
      if (!payload) return;

      if (payload.isHelp) {
        setTurns((prev) => [
          ...prev.slice(-19),
          {
            id: `a-help-${Date.now()}`,
            role: "assistant",
            text: HELP_TEXT,
            actions: [],
            done: true,
          },
        ]);
        return;
      }

      // If an open clarification is on screen, this message answers it —
      // same [CLARIFICATION REPLY] contract as the web console.
      const answeringClarification = turnsRef.current.some(
        (t) => t.clarification && !t.clarification.answered,
      );

      pushUserTurn(payload.displayText);
      setOrbState("thinking");
      const result = await postText(
        answeringClarification ? `[CLARIFICATION REPLY] ${payload.input}` : payload.input,
        {
          parsedDates: payload.parsedDates,
          parsedPriority: payload.parsedPriority,
          slashCommand: payload.slashCommand,
          linkedProjectIds: payload.projectIds,
          linkedHashtags: payload.hashtags,
        },
      );
      if (!result) {
        setOrbState("idle");
        pushUserTurn("⚠︎ couldn't reach JARVIS — check settings");
        return;
      }
      watchTurn(result.turnId);
    },
    [pushUserTurn, watchTurn],
  );

  /** 5s receipt undo — optimistic tombstone, then server round-trip. */
  const handleUndo = useCallback(
    async (turnId: string, action: ReceiptAction) => {
      const result = action.result as { ok?: boolean; id?: string; receipt?: Record<string, unknown> } | null;
      if (!result?.ok || typeof result.id !== "string") return;

      let target: UndoTarget;
      if (action.name === "create_task") {
        target = { kind: "task", id: result.id };
      } else if (action.name === "create_capture") {
        target = { kind: "capture", id: result.id };
      } else if (action.name === "create_event") {
        const receipt = result.receipt ?? {};
        const calendarId =
          typeof receipt.calendar_id === "string" ? receipt.calendar_id : "primary";
        target = { kind: "event", id: result.id, calendarId };
      } else {
        return;
      }

      const markUndone = (undone: boolean) =>
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  actions: t.actions.map((a) =>
                    a.toolUseId === action.toolUseId ? { ...a, undone } : a,
                  ),
                }
              : t,
          ),
        );

      markUndone(true);
      const ok = await postUndo(target);
      if (!ok) markUndone(false);
    },
    [],
  );

  /** Tapped a clarification option chip. */
  const handleClarificationReply = useCallback(
    async (option: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pushUserTurn(option);
      setOrbState("thinking");
      const result = await postText(`[CLARIFICATION REPLY] ${option}`);
      if (!result) {
        setOrbState("idle");
        pushUserTurn("⚠︎ couldn't reach JARVIS — check settings");
        return;
      }
      watchTurn(result.turnId);
    },
    [pushUserTurn, watchTurn],
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
                {turn.text ? (
                  <Text style={styles.turnText}>{turn.text}</Text>
                ) : !turn.done && turn.actions.length === 0 && !turn.clarification ? (
                  <ThinkingWord />
                ) : null}
                {turn.actions.map((a) => (
                  <JarvisReceipt
                    key={a.toolUseId}
                    action={a}
                    onUndo={
                      ["create_task", "create_capture", "create_event"].includes(a.name)
                        ? () => void handleUndo(turn.id, a)
                        : undefined
                    }
                  />
                ))}
                {turn.clarification ? (
                  <ClarificationCard
                    clarification={turn.clarification}
                    onReply={(opt) => void handleClarificationReply(opt)}
                  />
                ) : null}
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
        <View style={{ paddingBottom: 16 }}>
          <TextBar
            disabled={!ready}
            projects={context.projects}
            hashtags={context.hashtags}
            timezone={context.timezone}
            onSubmit={(s) => void handleText(s)}
          />
        </View>
      </KeyboardAvoidingView>

      <VoiceOverlay
        visible={overlayOpen}
        state={orbState}
        liveTranscript={liveTranscript}
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
});
