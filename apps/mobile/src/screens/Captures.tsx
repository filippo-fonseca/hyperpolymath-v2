// Captures — mobile feed with full CRUD. Reverse-chrono cards (serif
// content, #hashtags, provenance), tap to edit, FAB to capture.

import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createCapture,
  deleteCapture,
  getCaptures,
  updateCapture,
  type Capture,
} from "../lib/data";
import { useCollection } from "../lib/use-collection";
import { KiwiLoader } from "../components/KiwiLoader";
import { colors, mono, serif } from "../theme";
import {
  EmptyState,
  Fab,
  Field,
  FieldLabel,
  FormSheet,
  ScreenHeader,
} from "../components/shell";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface FormState {
  id: string | null;
  content: string;
  hashtags: string; // space-separated, with or without #
}

export function CapturesScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const { data, loading, refresh, mutate } = useCollection(getCaptures, active);
  const [form, setForm] = useState<FormState | null>(null);

  const parseTags = (raw: string): string[] =>
    raw
      .split(/[\s,]+/)
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 20);

  const save = async () => {
    if (!form || !form.content.trim()) return;
    const payload = {
      content: form.content.trim(),
      hashtagNames: parseTags(form.hashtags),
    };
    const id = form.id;
    setForm(null);
    if (id) {
      mutate(
        (cur) =>
          cur?.map((c) =>
            c.id === id
              ? {
                  ...c,
                  content: payload.content,
                  hashtags: payload.hashtagNames.map((n) => ({
                    id: `pending-${n}`,
                    name: n.toLowerCase(),
                    displayName: n,
                  })),
                }
              : c,
          ) ?? null,
      );
      await updateCapture({ id, ...payload });
    } else {
      await createCapture(payload);
    }
    void refresh();
  };

  const remove = async () => {
    if (!form?.id) return;
    const id = form.id;
    setForm(null);
    mutate((cur) => cur?.filter((c) => c.id !== id) ?? null);
    await deleteCapture(id);
    void refresh();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Captures" count={(data ?? []).length} paddingTop={insets.top + 8} />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />
        }
      >
        {data === null ? (
          <View style={{ paddingTop: 80, alignItems: "center" }}>
            <KiwiLoader size={34} />
          </View>
        ) : null}
        {data !== null && (data ?? []).length === 0 ? (
          <EmptyState message="Nothing captured yet. Thoughts go here." />
        ) : null}
        {(data ?? []).map((c: Capture) => (
          <Pressable
            key={c.id}
            onPress={() =>
              setForm({
                id: c.id,
                content: c.content,
                hashtags: c.hashtags.map((h) => `#${h.displayName}`).join(" "),
              })
            }
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.content}>{c.content}</Text>
            <View style={styles.metaRow}>
              {c.hashtags.length ? (
                <Text style={styles.tags}>#{c.hashtags.map((h) => h.displayName).join(" #")}</Text>
              ) : null}
              <Text style={styles.time}>
                {relativeTime(c.createdAt)}
                {c.sourceDevice ? ` · ${c.sourceDevice}` : ""}
                {c.createdVia === "jarvis" ? " · JARVIS" : ""}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <Fab onPress={() => setForm({ id: null, content: "", hashtags: "" })} />

      <FormSheet
        visible={form !== null}
        title={form?.id ? "Edit capture" : "New capture"}
        onClose={() => setForm(null)}
        onSave={() => void save()}
        onDelete={form?.id ? () => void remove() : undefined}
      >
        {form ? (
          <>
            <FieldLabel>CONTENT</FieldLabel>
            <Field
              value={form.content}
              onChangeText={(content) => setForm({ ...form, content })}
              placeholder="What's on your mind?"
              multiline
              autoFocus={!form.id}
            />
            <FieldLabel>HASHTAGS</FieldLabel>
            <Field
              value={form.hashtags}
              onChangeText={(hashtags) => setForm({ ...form, hashtags })}
              placeholder="#idea #books"
            />
          </>
        ) : null}
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingHorizontal: 20,
    gap: 10,
    paddingTop: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  content: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 16,
    lineHeight: 23,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tags: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
    flexShrink: 1,
  },
  time: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    marginLeft: "auto",
  },
});
