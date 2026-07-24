import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KiwiLoader } from "../components/KiwiLoader";
import { EmptyState, ErrorState, ScreenHeader, SearchBar } from "../components/shell";
import { getCaptures, getTasks, type Capture, type Task } from "../lib/data";
import { useCollection } from "../lib/use-collection";
import { font, sd } from "../theme";

interface SearchData {
  tasks: Task[];
  captures: Capture[];
}

async function getSearchData(): Promise<SearchData | null> {
  const [tasks, captures] = await Promise.all([getTasks(), getCaptures()]);
  // Both sources failed → surface a load error (retryable) rather than an
  // empty index that looks like "nothing to search".
  if (tasks === null && captures === null) return null;
  return {
    tasks: tasks ?? [],
    captures: captures ?? [],
  };
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SearchScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const { data, loading, error, refresh } = useCollection(getSearchData, active);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const taskResults = useMemo(() => {
    if (!q) return [];
    return (data?.tasks ?? []).filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        (task.notes?.toLowerCase().includes(q) ?? false) ||
        task.projects.some((project) => project.name.toLowerCase().includes(q)),
    );
  }, [data, q]);

  const captureResults = useMemo(() => {
    if (!q) return [];
    return (data?.captures ?? []).filter(
      (capture) =>
        capture.content.toLowerCase().includes(q) ||
        capture.hashtags.some((tag) => tag.displayName.toLowerCase().includes(q)) ||
        capture.projects.some((project) => project.name.toLowerCase().includes(q)),
    );
  }, [data, q]);

  const resultCount = taskResults.length + captureResults.length;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Search"
        count={q ? resultCount : undefined}
        paddingTop={insets.top + 8}
      />
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search tasks and captures…" />
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={sd.accent} />
        }
      >
        {data === null && !error ? (
          <View style={styles.loader}>
            <KiwiLoader size={34} />
          </View>
        ) : null}
        {data === null && error ? <ErrorState onRetry={() => void refresh()} /> : null}
        {data !== null && !q ? (
          <EmptyState message="Search titles, notes, captures, projects, and hashtags." />
        ) : null}
        {data !== null && q && resultCount === 0 ? (
          <EmptyState message={`No results for "${query.trim()}".`} />
        ) : null}

        {taskResults.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TASKS</Text>
            {taskResults.map((task) => (
              <View key={task.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.kind}>TASK</Text>
                  <Text style={styles.meta}>{task.priority}</Text>
                </View>
                <Text style={styles.title} numberOfLines={2}>
                  {task.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {task.dueDate ? `${task.dueDate} / ` : ""}
                  {task.status}
                  {task.projects.length ? ` / ${task.projects.map((p) => p.name).join(", ")}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {captureResults.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CAPTURES</Text>
            {captureResults.map((capture) => (
              <View key={capture.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.kind}>CAPTURE</Text>
                  <Text style={styles.meta}>{relativeTime(capture.createdAt)}</Text>
                </View>
                <Text style={styles.title} numberOfLines={3}>
                  {capture.content}
                </Text>
                {capture.hashtags.length > 0 ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {capture.hashtags.map((tag) => `#${tag.displayName}`).join(" ")}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
  },
  list: {
    paddingHorizontal: 20,
    gap: 10,
  },
  loader: {
    paddingTop: 80,
    alignItems: "center",
  },
  section: {
    gap: 8,
    marginTop: 12,
  },
  sectionTitle: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  card: {
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 13,
    gap: 7,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  kind: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  title: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  meta: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
