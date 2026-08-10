import React, { useCallback, useEffect } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max height as a fraction of the screen (default 0.85). */
  maxHeightRatio?: number;
}

const SLIDE_FROM = 480;

/**
 * Bottom sheet: radius 20 panel on a fading backdrop, 260ms collapse
 * curve, drag-down on the grab handle to dismiss.
 */
export function Sheet({ visible, onClose, children, maxHeightRatio = 0.85 }: SheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Resolved to a number: a percentage here would be measured against the
  // auto-sized KeyboardAvoidingView, not the screen, and can blow the panel
  // past the tab bar. Never taller than the screen minus the status area.
  const maxHeight = Math.min(
    Math.round(maxHeightRatio * windowHeight),
    windowHeight - insets.top - 24,
  );
  const translate = useSharedValue(SLIDE_FROM);
  const backdrop = useSharedValue(0);

  const collapse = t.motion.bezier.collapse;
  const collapseEasing = Easing.bezier(collapse[0], collapse[1], collapse[2], collapse[3]);

  const animateIn = useCallback(() => {
    backdrop.value = withTiming(1, { duration: t.motion.duration.panel });
    translate.value = withTiming(0, {
      duration: t.motion.duration.panel,
      easing: collapseEasing,
    });
  }, [backdrop, translate, t.motion, collapseEasing]);

  const animateOut = useCallback(
    (after?: () => void) => {
      backdrop.value = withTiming(0, { duration: t.motion.duration.enter });
      translate.value = withTiming(
        SLIDE_FROM,
        {
          duration: t.motion.duration.enter,
          easing: collapseEasing,
        },
        (finished) => {
          if (finished && after) runOnJS(after)();
        },
      );
    },
    [backdrop, translate, t.motion, collapseEasing],
  );

  useEffect(() => {
    if (visible) animateIn();
  }, [visible, animateIn]);

  const requestClose = useCallback(() => {
    animateOut(onClose);
  }, [animateOut, onClose]);

  const drag = Gesture.Pan()
    .onUpdate((e) => {
      translate.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 900) {
        backdrop.value = withTiming(0, { duration: 200 });
        translate.value = withTiming(SLIDE_FROM, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translate.value = withTiming(0, {
          duration: 160,
          easing: Easing.bezier(0.25, 1, 0.5, 1),
        });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translate.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(15,12,8,0.35)" },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            style={[
              {
                backgroundColor: t.c.surfaceRaised,
                borderTopLeftRadius: t.radius.sheet,
                borderTopRightRadius: t.radius.sheet,
                borderColor: t.c.edge,
                borderWidth: StyleSheet.hairlineWidth,
                paddingBottom: Math.max(insets.bottom, 12),
                maxHeight,
                // Clip: content past the cap must compress or scroll inside
                // the panel, never paint over whatever is behind the sheet.
                overflow: "hidden",
                ...t.shadow.pop,
              },
              panelStyle,
            ]}
          >
            <GestureDetector gesture={drag}>
              <View style={{ alignItems: "center", paddingVertical: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: t.c.edgeStrong,
                  }}
                />
              </View>
            </GestureDetector>
            <View style={{ flexShrink: 1 }}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
