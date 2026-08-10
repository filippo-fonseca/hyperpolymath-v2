import { PenLine, Sparkles, Trash2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useCaptureMutations, type Capture } from "@/data/useCaptures";
import { useTheme } from "@/theme";
import { AppText, Button, PressableRow, Sheet } from "@/ui";

import { fullStamp, parseHashtags } from "./relative-time";

export interface CaptureSheetProps {
  capture: Capture | null;
  onClose: () => void;
  onDelete: (capture: Capture) => void;
}

/** Detail sheet: edit in place, save optimistically, delete with confirm. */
export function CaptureSheet({ capture, onClose, onDelete }: CaptureSheetProps) {
  const t = useTheme();
  const { update } = useCaptureMutations();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (capture) setDraft(capture.content);
  }, [capture]);

  const dirty = capture !== null && draft.trim() !== capture.content.trim();
  const viaJarvis = capture?.createdVia === "jarvis";

  const save = () => {
    if (!capture || !dirty) return;
    const content = draft.trim();
    update.mutate({ id: capture.id, content, hashtagNames: parseHashtags(content) });
    onClose();
  };

  return (
    <Sheet visible={capture !== null} onClose={onClose}>
      {capture ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {viaJarvis ? (
              <Sparkles size={13} color={t.c.accent} strokeWidth={2.2} />
            ) : (
              <PenLine size={13} color={t.c.inkFaint} strokeWidth={2.2} />
            )}
            <AppText variant="micro" weight="medium" muted>
              {viaJarvis ? "Jarvis" : "Manual"}
            </AppText>
            <View style={{ flex: 1 }} />
            <AppText variant="micro" mono faint>
              {fullStamp(capture.createdAt)}
            </AppText>
          </View>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
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
              minHeight: 96,
              maxHeight: 240,
              textAlignVertical: "top",
            }}
            accessibilityLabel="Capture content"
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PressableRow
              onPress={() => {
                onClose();
                onDelete(capture);
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete capture"
              style={{
                width: 36,
                height: 36,
                borderRadius: t.radius.btn,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={16} color={t.c.coral} strokeWidth={2} />
            </PressableRow>
            <View style={{ flex: 1 }} />
            <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
            <Button
              label="Save"
              size="sm"
              disabled={!dirty || draft.trim().length === 0}
              onPress={save}
            />
          </View>
        </View>
      ) : (
        <View style={{ height: 1 }} />
      )}
    </Sheet>
  );
}
