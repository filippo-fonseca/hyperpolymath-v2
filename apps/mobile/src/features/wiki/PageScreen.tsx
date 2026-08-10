// Wiki page: reader by default, BlockNote editor on demand. One native
// header owns back / title / save badge / edit toggle; the editor bridges
// its in-document title up so the header stays truthful while typing.
// Pages carrying web-only nodes open read-only (the sanitize lock) so a
// mobile save can never destroy content the phone can't render.

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Lock, PenLine } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useWikiPage } from "@/data/useWiki";
import { useTheme, withAlpha } from "@/theme";
import {
  AppText,
  Button,
  EmptyState,
  PressableRow,
  Screen,
  Skeleton,
  SkeletonRows,
} from "@/ui";

import { Markdown } from "./Markdown";
import { PageEditor, type PageEditorHandle, type SaveState } from "./editor/PageEditor";
import { hasUnknownNodes } from "./editor/sanitize";

export default function PageScreen() {
  const t = useTheme();
  const router = useRouter();
  const { pageId, edit } = useLocalSearchParams<{ pageId: string; edit?: string }>();
  const query = useWikiPage(pageId ?? null);
  const page = query.data ?? null;

  const [editing, setEditing] = useState(edit === "1");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Header mirror of the in-document title while the editor owns it.
  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  const editorRef = useRef<PageEditorHandle>(null);

  const locked = page !== null && hasUnknownNodes(page.contentJson);

  // A locked page can never be in edit mode, even via ?edit=1.
  useEffect(() => {
    if (locked && editing) setEditing(false);
  }, [locked, editing]);

  // Fresh content when returning to this screen (web edits, Jarvis writes).
  useFocusEffect(
    useCallback(() => {
      if (!editing && page !== null) void query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing]),
  );

  const finishEditing = useCallback(async () => {
    await editorRef.current?.flush();
    setEditing(false);
    setSaveState("idle");
    setLiveTitle(null);
  }, []);

  const title =
    liveTitle ?? (page ? page.title.trim() || "Untitled" : "");

  return (
    <Screen padded={false}>
      {/* Header: back · title · badge + edit toggle */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 8,
          paddingBottom: 8,
          borderBottomWidth: 0.5,
          borderBottomColor: t.c.edge,
        }}
      >
        <PressableRow
          onPress={() => {
            if (editing) void finishEditing().then(() => router.back());
            else router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{
            width: 32,
            height: 32,
            borderRadius: t.radius.tile,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={20} color={t.c.inkMuted} strokeWidth={2} />
        </PressableRow>

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {page?.emoji ? <AppText variant="meta">{page.emoji}</AppText> : null}
          <AppText variant="meta" weight="medium" muted numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </AppText>
        </View>

        <SaveBadge state={editing ? saveState : "idle"} />

        {page !== null && !locked ? (
          editing ? (
            <Button
              label="Done"
              size="sm"
              variant="ghost"
              onPress={() => void finishEditing()}
            />
          ) : (
            <PressableRow
              onPress={() => setEditing(true)}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Edit page"
              style={{
                width: 32,
                height: 32,
                borderRadius: t.radius.tile,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PenLine size={16} color={t.c.inkMuted} strokeWidth={2} />
            </PressableRow>
          )
        ) : null}
      </View>

      {locked ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginHorizontal: 16,
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: t.radius.btn,
            backgroundColor: withAlpha(t.c.amber, t.scheme === "light" ? 0.1 : 0.16),
          }}
        >
          <Lock size={13} color={t.c.amber} strokeWidth={2} />
          <AppText variant="micro" color={t.c.amber} style={{ flex: 1 }}>
            This page uses blocks mobile can&apos;t edit yet — read-only.
          </AppText>
        </View>
      ) : null}

      {query.isLoading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 16 }}>
          <Skeleton width="60%" height={24} />
          <SkeletonRows rows={5} />
        </View>
      ) : page === null ? (
        <EmptyState
          title="Couldn't load this page"
          caption="Check the server connection, then try again."
          action={
            <Button
              label="Retry"
              variant="outline"
              size="sm"
              onPress={() => void query.refetch()}
            />
          }
        />
      ) : editing ? (
        <Animated.View entering={FadeIn.duration(t.motion.duration.micro)} style={{ flex: 1 }}>
          <PageEditor
            ref={editorRef}
            page={page}
            autoFocus={edit === "1" || (page.contentJson === null && !page.content)}
            onSaveState={setSaveState}
            onTitleChange={setLiveTitle}
          />
        </Animated.View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 64 }}
        >
          <Animated.View entering={FadeInDown.duration(t.motion.duration.enter)}>
            {page.emoji ? (
              <AppText style={{ fontSize: 40, lineHeight: 48, marginBottom: 6 }}>
                {page.emoji}
              </AppText>
            ) : null}
            <AppText variant="display" weight="semibold" style={{ marginBottom: 14 }}>
              {page.title.trim() || "Untitled"}
            </AppText>
            {page.content && page.content.trim() ? (
              <Markdown source={page.content} />
            ) : (
              <EmptyState
                title="This page is empty"
                caption={locked ? undefined : "Start writing — edits save as you type."}
                action={
                  locked ? undefined : (
                    <Button
                      label="Write"
                      size="sm"
                      variant="outline"
                      icon={<PenLine size={14} color={t.c.ink} strokeWidth={2} />}
                      onPress={() => setEditing(true)}
                    />
                  )
                }
              />
            )}
          </Animated.View>
        </ScrollView>
      )}
    </Screen>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const t = useTheme();
  if (state === "idle") return null;
  const label = state === "saving" ? "saving…" : state === "saved" ? "saved" : "retrying";
  const color =
    state === "error" ? t.c.coral : state === "saved" ? t.c.sage : t.c.inkFaint;
  return (
    <Animated.View entering={FadeIn.duration(t.motion.duration.micro)}>
      <AppText variant="micro" mono color={color}>
        {label}
      </AppText>
    </Animated.View>
  );
}
