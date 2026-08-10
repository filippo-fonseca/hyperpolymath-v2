import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Copy, PenLine, Sparkles, Star, Trash2 } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { useCaptureMutations, type Capture } from "@/data/useCaptures";
import { useTheme } from "@/theme";
import { AppText, Button, PressableRow, Sheet, toast } from "@/ui";

import { fullStamp, parseHashtags } from "./relative-time";

export interface CaptureSheetProps {
  /** Capture being edited; null unless editing. */
  capture: Capture | null;
  /** True presents an empty new-capture sheet (widget deep link, header +). */
  composing: boolean;
  onClose: () => void;
  onCreate: (content: string) => void;
  onDelete: (capture: Capture) => void;
}

const EDITOR_MIN_HEIGHT = 110;

/**
 * One sheet, two moods: edit an existing capture in place, or compose a
 * fresh one with the keyboard already up. The editor grows with its text
 * and scrolls internally past ~40% of the screen.
 */
export function CaptureSheet({
  capture,
  composing,
  onClose,
  onCreate,
  onDelete,
}: CaptureSheetProps) {
  const t = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { update } = useCaptureMutations();
  const [draft, setDraft] = useState("");
  const [editorHeight, setEditorHeight] = useState(EDITOR_MIN_HEIGHT);
  const inputRef = useRef<TextInput | null>(null);

  const visible = capture !== null || composing;
  const isNew = capture === null;
  const editorMax = Math.round(windowHeight * 0.4);

  useEffect(() => {
    if (!visible) return;
    setDraft(capture?.content ?? "");
    setEditorHeight(EDITOR_MIN_HEIGHT);
    if (capture === null) {
      // Compose mode: keyboard up immediately. The small delay lets the
      // panel's entrance settle so iOS doesn't drop the focus request.
      const id = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [visible, capture]);

  const dirty = isNew
    ? draft.trim().length > 0
    : capture !== null && draft.trim() !== capture.content.trim();
  const viaJarvis = capture?.createdVia === "jarvis";
  const iconButton = {
    width: 36,
    height: 36,
    borderRadius: t.radius.btn,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  const toggleFavorite = () => {
    if (!capture) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update.mutate({ id: capture.id, favorite: !capture.favorite });
  };

  const copy = () => {
    if (!capture) return;
    void Clipboard.setStringAsync(draft.trim() || capture.content).then(() =>
      toast("Copied."),
    );
  };

  const save = () => {
    const content = draft.trim();
    if (!dirty || content.length === 0) return;
    if (isNew) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onCreate(content);
    } else if (capture) {
      update.mutate({ id: capture.id, content, hashtagNames: parseHashtags(content) });
    }
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 4, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isNew ? (
            <PenLine size={13} color={t.c.inkFaint} strokeWidth={2.2} />
          ) : viaJarvis ? (
            <Sparkles size={13} color={t.c.accent} strokeWidth={2.2} />
          ) : (
            <PenLine size={13} color={t.c.inkFaint} strokeWidth={2.2} />
          )}
          <AppText variant="micro" weight="medium" muted>
            {isNew ? "New capture" : viaJarvis ? "Jarvis" : "Manual"}
          </AppText>
          {capture ? (
            <AppText variant="micro" mono faint style={{ marginLeft: 6 }}>
              {fullStamp(capture.createdAt)}
            </AppText>
          ) : null}
          <View style={{ flex: 1 }} />
          {capture ? (
            <PressableRow
              onPress={toggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={capture.favorite ? "Unstar capture" : "Star capture"}
              accessibilityState={{ selected: capture.favorite }}
              style={iconButton}
            >
              <Star
                size={16}
                color={capture.favorite ? t.c.amber : t.c.inkFaint}
                fill={capture.favorite ? t.c.amber : "transparent"}
                strokeWidth={2}
              />
            </PressableRow>
          ) : null}
        </View>

        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
          placeholder={isNew ? "What's on your mind?" : undefined}
          placeholderTextColor={t.c.inkFaint}
          scrollEnabled={editorHeight >= editorMax}
          onContentSizeChange={(e) =>
            setEditorHeight(
              Math.min(
                Math.max(
                  Math.ceil(e.nativeEvent.contentSize.height) + 22,
                  EDITOR_MIN_HEIGHT,
                ),
                editorMax,
              ),
            )
          }
          style={{
            fontFamily: t.fonts.sans,
            fontSize: t.type.body.fontSize,
            lineHeight: t.type.body.lineHeight,
            color: t.c.ink,
            backgroundColor: t.c.surface,
            borderRadius: t.radius.btn,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.c.edge,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 10,
            height: editorHeight,
            textAlignVertical: "top",
          }}
          accessibilityLabel="Capture content"
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {capture ? (
            <>
              <PressableRow
                onPress={() => {
                  onClose();
                  onDelete(capture);
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete capture"
                style={iconButton}
              >
                <Trash2 size={16} color={t.c.coral} strokeWidth={2} />
              </PressableRow>
              <PressableRow
                onPress={copy}
                accessibilityRole="button"
                accessibilityLabel="Copy capture text"
                style={iconButton}
              >
                <Copy size={16} color={t.c.inkFaint} strokeWidth={2} />
              </PressableRow>
            </>
          ) : null}
          <View style={{ flex: 1 }} />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
          <Button
            label={isNew ? "Capture" : "Save"}
            size="sm"
            disabled={!dirty || draft.trim().length === 0}
            onPress={save}
          />
        </View>
      </View>
    </Sheet>
  );
}
