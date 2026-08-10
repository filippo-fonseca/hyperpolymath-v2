import { FlashList } from "@shopify/flash-list";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { Inbox, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, RefreshControl, TextInput, View } from "react-native";

import { useCaptures, useCaptureMutations, type Capture } from "@/data/useCaptures";
import { useTheme } from "@/theme";
import {
  AppText,
  Button,
  EmptyState,
  PressableRow,
  Screen,
  ScreenHeader,
  Skeleton,
  toast,
} from "@/ui";

import { CaptureCard } from "./CaptureCard";
import { CaptureComposer } from "./CaptureComposer";
import { CaptureSheet } from "./CaptureSheet";
import { parseHashtags } from "./relative-time";

function FeedSkeleton() {
  return (
    <View style={{ gap: 8, paddingTop: 4 }}>
      {[72, 88, 64, 96, 72].map((h, i) => (
        <Skeleton key={i} height={h} radius={8} />
      ))}
    </View>
  );
}

export default function CapturesScreen() {
  const t = useTheme();
  const query = useCaptures();
  const { create, remove } = useCaptureMutations();
  const [selected, setSelected] = useState<Capture | null>(null);
  const [composing, setComposing] = useState(false);
  const composerRef = useRef<TextInput | null>(null);

  // Widget deep link: /captures?compose=1 opens a fresh capture sheet with
  // the keyboard up — zero extra taps. The param is cleared after handling
  // so back-navigation won't re-trigger it; works from cold start because
  // the param rides the initial route.
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  useEffect(() => {
    if (compose !== "1") return;
    router.setParams({ compose: undefined });
    setComposing(true);
  }, [compose]);

  // Stagger the rise-in only for the first painted batch; later arrivals
  // (optimistic inserts, refetch echoes) enter individually at index 0.
  const [initialAnimation, setInitialAnimation] = useState(true);
  const hasData = query.data !== undefined;
  const staggerArmed = useRef(false);
  useEffect(() => {
    if (!hasData || staggerArmed.current) return;
    staggerArmed.current = true;
    const id = setTimeout(() => setInitialAnimation(false), 800);
    return () => clearTimeout(id);
  }, [hasData]);

  const submit = useCallback(
    (content: string) => {
      create.mutate({ content, hashtagNames: parseHashtags(content) });
    },
    [create],
  );

  const confirmDelete = useCallback(
    (capture: Capture) => {
      Alert.alert("Delete capture?", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => remove.mutate(capture.id),
        },
      ]);
    },
    [remove],
  );

  const quickActions = useCallback(
    (capture: Capture) => {
      Alert.alert(
        "Capture",
        capture.content.length > 120
          ? `${capture.content.slice(0, 120)}…`
          : capture.content,
        [
          { text: "Edit", onPress: () => setSelected(capture) },
          {
            text: "Copy",
            onPress: () => {
              void Clipboard.setStringAsync(capture.content).then(() =>
                toast("Copied."),
              );
            },
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => confirmDelete(capture),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    },
    [confirmDelete],
  );

  const captures = query.data ?? [];
  const jarvisCount = captures.filter((c) => c.createdVia === "jarvis").length;

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Captures"
          subtitle={
            captures.length > 0
              ? `${captures.length} recent · ${jarvisCount} via Jarvis`
              : "Quick thoughts, kept"
          }
          right={
            <PressableRow
              onPress={() => setComposing(true)}
              accessibilityRole="button"
              accessibilityLabel="New capture"
              style={{
                width: 32,
                height: 32,
                borderRadius: t.radius.btn,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={18} color={t.c.inkMuted} strokeWidth={2.2} />
            </PressableRow>
          }
        />
        <View style={{ paddingTop: 4, paddingBottom: 12 }}>
          <CaptureComposer onSubmit={submit} inputRef={composerRef} />
        </View>
      </View>

      {query.isLoading ? (
        <View style={{ paddingHorizontal: 16 }}>
          <FeedSkeleton />
        </View>
      ) : query.isError ? (
        <EmptyState
          title="Couldn't load captures"
          caption="Check the connection and try again."
          action={
            <Button
              label="Retry"
              variant="outline"
              size="sm"
              onPress={() => void query.refetch()}
            />
          }
        />
      ) : captures.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} color={t.c.inkFaint} strokeWidth={1.8} />}
          title="Nothing captured yet"
          caption="Thoughts land here the moment you have them."
        />
      ) : (
        <FlashList
          data={captures}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <CaptureCard
              capture={item}
              index={initialAnimation ? index : 0}
              animateIn
              onPress={setSelected}
              onLongPress={quickActions}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isLoading}
              onRefresh={() => void query.refetch()}
              tintColor={t.c.inkFaint}
            />
          }
          ListFooterComponent={
            captures.length > 8 ? (
              <AppText
                variant="micro"
                faint
                mono
                style={{ textAlign: "center", paddingVertical: 16 }}
              >
                {captures.length} captures
              </AppText>
            ) : null
          }
        />
      )}

      <CaptureSheet
        capture={selected}
        composing={composing}
        onClose={() => {
          setSelected(null);
          setComposing(false);
        }}
        onCreate={submit}
        onDelete={confirmDelete}
      />
    </Screen>
  );
}
