// One transcript row. Memoized — during streaming the turns array is
// referentially stable, so completed rows never re-render; the live text
// renders in StreamingText, a leaf subscribed to the stream store.

import React, { memo, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";

import { useTheme } from "@/theme";
import { AppText } from "@/ui";

import { ReceiptChip } from "./ReceiptChip";
import { streamStore } from "./stream-store";
import { ThinkingWord } from "./ThinkingWord";
import type { JarvisTurn, ReceiptAction } from "./types";

function StreamingText({ turnId }: { turnId: string }) {
  const snapshot = useSyncExternalStore(streamStore.subscribe, streamStore.getSnapshot);
  if (snapshot.turnId !== turnId || !snapshot.text) return null;
  return <AppText variant="body">{snapshot.text}</AppText>;
}

export interface TurnRowProps {
  turn: JarvisTurn;
  canUndo: (action: ReceiptAction) => boolean;
  onUndo: (turnId: string, action: ReceiptAction) => void;
}

export const TurnRow = memo(function TurnRow({ turn, canUndo, onUndo }: TurnRowProps) {
  const t = useTheme();

  if (turn.role === "user") {
    return (
      <Animated.View
        entering={FadeIn.duration(t.motion.duration.enter).reduceMotion(ReduceMotion.System)}
        style={styles.userWrap}
      >
        <View
          style={{
            backgroundColor: t.c.surface,
            borderColor: t.c.edge,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: t.radius.card,
            borderBottomRightRadius: t.radius.row,
            paddingHorizontal: 12,
            paddingVertical: 8,
            maxWidth: "82%",
            opacity: turn.provisional ? 0.7 : 1,
          }}
        >
          <AppText variant="body">{turn.text}</AppText>
        </View>
      </Animated.View>
    );
  }

  const streaming = turn.status === "streaming";
  const pending = turn.status === "pending";
  const failed = turn.status === "error";

  return (
    <Animated.View
      entering={FadeIn.duration(t.motion.duration.enter).reduceMotion(ReduceMotion.System)}
      style={styles.assistantWrap}
    >
      {pending ? <ThinkingWord /> : null}
      {streaming ? <StreamingText turnId={turn.id} /> : null}
      {!pending && !streaming && turn.text ? (
        <AppText variant="body">{turn.text}</AppText>
      ) : null}
      {failed ? (
        <AppText variant="meta" color={t.c.coral}>
          {turn.error ?? "Something went wrong."}
        </AppText>
      ) : null}
      {turn.actions?.length ? (
        <View style={styles.receipts}>
          {turn.actions.map((action) => (
            <ReceiptChip
              key={action.toolUseId}
              action={action}
              undoable={canUndo(action)}
              onUndo={() => onUndo(turn.id, action)}
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  userWrap: {
    alignItems: "flex-end",
    paddingVertical: 6,
  },
  assistantWrap: {
    alignItems: "stretch",
    paddingVertical: 6,
    gap: 8,
  },
  receipts: {
    gap: 6,
  },
});
