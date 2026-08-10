// The center home screen. Welcome hero (orb, greeting, suggestion chips)
// until the first turn, then a bottom-anchored transcript panel above the
// composer. The panel is capped at a fixed fraction of the usable height and
// scrolls internally past the cap (never layout-animated per content change),
// following the bottom only while the user is already there. Once a turn
// completes, a quiet chevron collapses the panel back to the compact input
// (which also clears the transcript). All streaming work happens in the
// engine + stream store; this component re-renders at turn boundaries only.

import React, { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronDown, Eraser, Settings2 } from "lucide-react-native";

import { useTheme } from "@/theme";
import { AppText, Chip, Logotype, PressableRow, Screen, Spinner } from "@/ui";

import { Composer, type ComposerHandle } from "./Composer";
import { Orb } from "./Orb";
import { TurnRow } from "./TurnRow";
import { streamStore } from "./stream-store";
import { useJarvisEngine } from "./useJarvisEngine";
import { VoiceOverlay } from "./VoiceOverlay";

const SUGGESTIONS = ["Plan my day", "/task ", "/capture "];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

export default function JarvisScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const engine = useJarvisEngine();
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const atBottom = useRef(true);
  const scrollQueued = useRef(false);

  const maybeFollowBottom = useCallback(() => {
    if (!atBottom.current || scrollQueued.current) return;
    scrollQueued.current = true;
    requestAnimationFrame(() => {
      scrollQueued.current = false;
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  // Streamed text grows the content — follow it only from the bottom, on the
  // store's ~80ms flush cadence rather than per token.
  useEffect(() => streamStore.subscribe(maybeFollowBottom), [maybeFollowBottom]);
  useEffect(() => {
    maybeFollowBottom();
  }, [engine.turns.length, maybeFollowBottom]);

  const confirmClear = useCallback(() => {
    Alert.alert("Clear conversation?", "The transcript on this phone is erased.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => void engine.clearConversation() },
    ]);
  }, [engine]);

  const statusColor =
    engine.sseStatus === "connected"
      ? t.c.sage
      : engine.sseStatus === "connecting"
        ? t.c.amber
        : t.c.coral;

  const empty = engine.turns.length === 0;
  const tabBarHeight = 56 + Math.max(insets.bottom, 8);
  // Hard cap for the transcript panel: about half the usable height above the
  // composer. A per-device constant — the panel grows into it with content and
  // scrolls internally past it, so streaming never pushes layout beyond the cap.
  const panelMax = Math.round((windowHeight - insets.top - tabBarHeight) * 0.45);
  const collapsible = !empty && !engine.busy;

  return (
    <Screen padded={false} topInset bottomInset={false}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={tabBarHeight}
      >
        {/* Tapping any non-interactive area drops the keyboard; drags and
            child presses are untouched (a moved touch never counts as a press). */}
        <Pressable
          style={styles.fill}
          onPress={() => Keyboard.dismiss()}
          accessible={false}
        >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: empty ? "transparent" : t.c.edge }]}>
          <View style={styles.headerLeft}>
            {!empty ? (
              <Animated.View
                entering={FadeIn.duration(t.motion.duration.enter).reduceMotion(
                  ReduceMotion.System,
                )}
                style={styles.headerBrand}
              >
                <Orb state={engine.orbState} size={26} />
                <Logotype size={17}>JARVIS</Logotype>
              </Animated.View>
            ) : null}
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
              accessibilityLabel={`Connection ${engine.sseStatus}`}
            />
          </View>
          <View style={styles.headerRight}>
            {!empty ? (
              <PressableRow
                accessibilityRole="button"
                accessibilityLabel="Clear conversation"
                onPress={confirmClear}
                style={[styles.headerBtn, { borderRadius: t.radius.tile }]}
              >
                <Eraser size={17} color={t.c.inkMuted} strokeWidth={1.8} />
              </PressableRow>
            ) : null}
            <PressableRow
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
              style={[styles.headerBtn, { borderRadius: t.radius.tile }]}
            >
              <Settings2 size={17} color={t.c.inkMuted} strokeWidth={1.8} />
            </PressableRow>
          </View>
        </View>

        {/* Body */}
        {!engine.hydrated ? (
          <View style={styles.hero}>
            <Spinner size="md" />
          </View>
        ) : empty ? (
          <Animated.View
            entering={FadeIn.duration(t.motion.duration.panel).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
            style={styles.hero}
          >
            <Orb state={engine.orbState} size={132} />
            <View style={styles.heroText}>
              <Logotype size={30}>JARVIS</Logotype>
              <AppText variant="meta" muted>
                {greeting()} What's on your mind?
              </AppText>
            </View>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Chip
                  key={s}
                  label={s.trim()}
                  onPress={() => composerRef.current?.prefill(s)}
                />
              ))}
            </View>
          </Animated.View>
        ) : (
          <View style={styles.bodyEnd}>
            <Animated.View
              entering={FadeIn.duration(t.motion.duration.panel).reduceMotion(
                ReduceMotion.System,
              )}
              style={[styles.panel, { maxHeight: panelMax, borderTopColor: t.c.edge }]}
            >
              {/* Fixed-height handle strip: the chevron appears once the turn
                  is done, so the panel height never jumps at stream end. */}
              <View style={styles.handleRow}>
                {collapsible ? (
                  <Animated.View
                    entering={FadeIn.duration(t.motion.duration.micro).reduceMotion(
                      ReduceMotion.System,
                    )}
                  >
                    <PressableRow
                      accessibilityRole="button"
                      accessibilityLabel="Collapse and clear conversation"
                      onPress={() => void engine.clearConversation()}
                      style={[styles.handleBtn, { borderRadius: t.radius.pill }]}
                    >
                      <ChevronDown size={17} color={t.c.inkMuted} strokeWidth={1.8} />
                    </PressableRow>
                  </Animated.View>
                ) : null}
              </View>
              <ScrollView
                ref={scrollRef}
                style={styles.panelScroll}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  atBottom.current =
                    contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
                }}
                scrollEventThrottle={32}
                onContentSizeChange={maybeFollowBottom}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              >
                {engine.turns.map((turn) => (
                  <TurnRow
                    key={turn.id}
                    turn={turn}
                    canUndo={engine.canUndo}
                    onUndo={engine.undoAction}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          </View>
        )}
        </Pressable>

        {/* Composer */}
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4 }}>
          <Composer
            ref={composerRef}
            busy={engine.busy}
            onSend={(text) => void engine.sendText(text)}
            onMic={() => void engine.startVoice()}
            onStop={() => void engine.stopAll()}
          />
        </View>
      </KeyboardAvoidingView>

      {engine.voice.phase !== "idle" ? (
        <VoiceOverlay
          interim={engine.voice.interim}
          uploading={engine.voice.phase === "uploading"}
          onSend={() => void engine.stopVoice()}
          onCancel={() => void engine.cancelVoice()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  bodyEnd: {
    flex: 1,
    justifyContent: "flex-end",
  },
  panel: {
    flexShrink: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  panelScroll: {
    flexShrink: 1,
  },
  handleRow: {
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  handleBtn: {
    width: 44,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    alignItems: "center",
    gap: 6,
  },
  chips: {
    flexDirection: "row",
    gap: 8,
  },
});
