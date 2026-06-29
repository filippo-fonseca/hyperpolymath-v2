// Captures — mobile feed with full CRUD. Reverse-chrono cards (serif
// content, #hashtags, provenance), tap to edit, FAB to capture.

import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
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
  createTask,
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
  SearchBar,
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
}

export function CapturesScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const { data, loading, refresh, mutate } = useCollection(getCaptures, active);
  const [form, setForm] = useState<FormState | null>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Distinct hashtags across loaded captures, by frequency then alpha.
  const tags = useMemo(() => {
    const counts = new Map<string, { display: string; n: number }>();
    for (const c of data ?? []) {
      for (const h of c.hashtags) {
        const cur = counts.get(h.name) ?? { display: h.displayName, n: 0 };
        cur.n += 1;
        counts.set(h.name, cur);
      }
    }
    return [...counts.entries()]
      .sort((a, z) => z[1].n - a[1].n || a[1].display.localeCompare(z[1].display))
      .map(([name, v]) => ({ name, display: v.display }));
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (activeTag && !c.hashtags.some((h) => h.name === activeTag)) return false;
      if (!q) return true;
      return (
        c.content.toLowerCase().includes(q) ||
        c.hashtags.some((h) => h.displayName.toLowerCase().includes(q))
      );
    });
  }, [data, query, activeTag]);

  // Extract inline #hashtags from the capture text, mirroring the web composer
  // (CAPT-08): #word not preceded by a letter/number/underscore; first-seen
  // casing wins, server lowercases for canonical storage.
  const extractHashtags = (text: string): string[] => {
    const re = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
    const seen = new Map<string, string>();
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (!seen.has(lower)) seen.set(lower, raw);
    }
    return [...seen.values()].slice(0, 20);
  };

  const save = async () => {
    if (!form || !form.content.trim()) return;
    const payload = {
      content: form.content.trim(),
      hashtagNames: extractHashtags(form.content),
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

  // Promote a capture into a task: create the task from its content, then
  // remove the capture (it has graduated). Optimistic on the capture side.
  const promote = async () => {
    if (!form?.id || !form.content.trim()) return;
    const id = form.id;
    const title = form.content.trim();
    setForm(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    mutate((cur) => cur?.filter((c) => c.id !== id) ?? null);
    await createTask({ title });
    await deleteCapture(id);
    void refresh();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Captures" count={(data ?? []).length} paddingTop={insets.top + 8} />
      {data && data.length > 0 ? (
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search captures…" />
      ) : null}
      {tags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagBar}
          keyboardShouldPersistTaps="handled"
        >
          {tags.map((t) => {
            const selected = activeTag === t.name;
            return (
              <Pressable
                key={t.name}
                onPress={() => setActiveTag(selected ? null : t.name)}
                style={({ pressed }) => [
                  styles.tagChip,
                  selected && styles.tagChipSelected,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.tagChipLabel, selected && styles.tagChipLabelSelected]}>
                  #{t.display}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
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
        {data !== null && data.length > 0 && filtered.length === 0 ? (
          <EmptyState message="No captures match this filter." />
        ) : null}
        {filtered.map((c: Capture) => (
          <Pressable
            key={c.id}
            onPress={() =>
              setForm({ id: c.id, content: c.content })
            }
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.content}>{c.content}</Text>
            <View style={styles.metaRow}>
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

      <Fab onPress={() => setForm({ id: null, content: "" })} />

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
              placeholder="What's on your mind? Use #tags inline"
              multiline
              autoFocus={!form.id}
            />
            {form.id ? (
              <Pressable
                onPress={() => void promote()}
                style={({ pressed }) => [styles.promoteButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.promoteLabel}>→ PROMOTE TO TASK</Text>
              </Pressable>
            ) : null}
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
  tagBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
  },
  tagChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
  },
  tagChipLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
  },
  tagChipLabelSelected: {
    color: colors.accent,
  },
  promoteButton: {
    marginTop: 18,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  promoteLabel: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
});
