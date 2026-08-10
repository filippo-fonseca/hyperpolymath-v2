import { Hash, PenLine, Sparkles } from "lucide-react-native";
import React, { memo, useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import type { Capture } from "@/data/useCaptures";
import { useTheme } from "@/theme";
import { AppText, PressableRow } from "@/ui";

import { relativeStamp } from "./relative-time";

export interface CaptureCardProps {
  capture: Capture;
  index: number;
  /** Staggered rise-in for the initial batch only. */
  animateIn: boolean;
  onPress: (capture: Capture) => void;
  onLongPress: (capture: Capture) => void;
}

/** Inline body with #tags picked out in faint accent — text, never chips. */
function Body({ content }: { content: string }) {
  const t = useTheme();
  const parts = useMemo(() => content.split(/(#[\p{L}\p{N}_-]+)/gu), [content]);
  return (
    <AppText variant="body" numberOfLines={3}>
      {parts.map((part, i) =>
        part.startsWith("#") ? (
          <AppText key={i} variant="body" color={t.c.accent} style={{ opacity: 0.8 }}>
            {part}
          </AppText>
        ) : (
          part
        ),
      )}
    </AppText>
  );
}

function CaptureCardInner({
  capture,
  index,
  animateIn,
  onPress,
  onLongPress,
}: CaptureCardProps) {
  const t = useTheme();
  const viaJarvis = capture.createdVia === "jarvis";
  const tagLine = useMemo(() => {
    const tags = capture.hashtags.slice(0, 2).map((h) => h.displayName || h.name);
    const project = capture.projects[0]?.name;
    return [...tags, ...(project ? [project] : [])];
  }, [capture.hashtags, capture.projects]);

  // Tags typed inline already show in the body; the meta line only earns
  // its row when it adds something new.
  const inlineTags = useMemo(
    () => new Set([...capture.content.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]?.toLowerCase())),
    [capture.content],
  );
  const metaTags = tagLine.filter((s) => !inlineTags.has(s.toLowerCase()));

  const card = (
    <PressableRow
      onPress={() => onPress(capture)}
      onLongPress={() => onLongPress(capture)}
      accessibilityRole="button"
      accessibilityLabel={`Capture: ${capture.content.slice(0, 80)}`}
      pressColor={t.c.hover}
      style={{
        backgroundColor: t.c.surface,
        borderRadius: t.radius.tile,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {viaJarvis ? (
          <Sparkles size={12} color={t.c.accent} strokeWidth={2.2} />
        ) : (
          <PenLine size={12} color={t.c.inkFaint} strokeWidth={2.2} />
        )}
        <AppText variant="micro" weight="medium" muted={viaJarvis} faint={!viaJarvis}>
          {viaJarvis ? "Jarvis" : "Manual"}
        </AppText>
        <View style={{ flex: 1 }} />
        <AppText variant="micro" mono faint>
          {relativeStamp(capture.createdAt)}
        </AppText>
      </View>
      <Body content={capture.content} />
      {metaTags.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Hash size={11} color={t.c.inkFaint} strokeWidth={2.2} />
          <AppText variant="micro" faint numberOfLines={1}>
            {metaTags.join(" · ")}
          </AppText>
        </View>
      ) : null}
    </PressableRow>
  );

  if (!animateIn) return <View style={{ marginBottom: 8 }}>{card}</View>;
  return (
    <Animated.View
      style={{ marginBottom: 8 }}
      entering={FadeInDown.duration(200)
        .delay(20 * Math.min(index, 12))
        .springify()
        .damping(30)}
    >
      {card}
    </Animated.View>
  );
}

export const CaptureCard = memo(CaptureCardInner);
