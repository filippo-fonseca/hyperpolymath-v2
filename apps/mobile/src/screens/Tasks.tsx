// Tasks — mobile view with full CRUD. Grouped by due bucket (overdue /
// today / upcoming / no date / done), tap the ring to complete ("lesno"),
// tap a row to edit, FAB to create.

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
  createTask,
  deleteTask,
  getTasks,
  localDateString,
  PRIORITIES,
  STATUSES,
  updateTask,
  type Priority,
  type Task,
  type TaskStatus,
} from "../lib/data";
import { celebrate } from "../components/celebrate";
import { KiwiLoader } from "../components/KiwiLoader";
import { useCollection } from "../lib/use-collection";
import { colors, mono, serif } from "../theme";
import {
  ChipRow,
  EmptyState,
  Fab,
  Field,
  FieldLabel,
  FormSheet,
  ScreenHeader,
} from "../components/shell";

const PRIORITY_COLOR: Record<Priority, string> = {
  "P∞": "#e54b4b",
  P1: "#d9a03f",
  P2: "#3aa6c4",
  P3: "#7d93a0",
};

type DuePreset = "today" | "tomorrow" | "next week" | "none";
const DUE_PRESETS: DuePreset[] = ["today", "tomorrow", "next week", "none"];

function presetToDate(preset: DuePreset | null): string | null {
  if (preset === "today") return localDateString(0);
  if (preset === "tomorrow") return localDateString(1);
  if (preset === "next week") return localDateString(7);
  return null;
}

function bucketOf(t: Task): "overdue" | "today" | "upcoming" | "someday" | "done" {
  if (t.status === "lesno") return "done";
  if (!t.dueDate) return "someday";
  const today = localDateString(0);
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return "today";
  return "upcoming";
}

const BUCKET_ORDER = ["overdue", "today", "upcoming", "someday", "done"] as const;
const BUCKET_LABEL: Record<(typeof BUCKET_ORDER)[number], string> = {
  overdue: "OVERDUE",
  today: "TODAY",
  upcoming: "UPCOMING",
  someday: "NO DATE",
  done: "DONE",
};

interface FormState {
  id: string | null;
  title: string;
  priority: Priority;
  status: TaskStatus;
  duePreset: DuePreset | null;
  dueDate: string | null;
  notes: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  priority: "P3",
  status: "not started",
  duePreset: "today",
  dueDate: localDateString(0),
  notes: "",
};

export function TasksScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const { data, loading, refresh, mutate } = useCollection(getTasks, active);
  const [form, setForm] = useState<FormState | null>(null);
  const [showDone, setShowDone] = useState(false);

  const grouped = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of data ?? []) {
      const b = bucketOf(t);
      (groups[b] ??= []).push(t);
    }
    for (const b of BUCKET_ORDER) {
      groups[b]?.sort((a, z) =>
        (a.dueDate ?? "9999").localeCompare(z.dueDate ?? "9999") ||
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(z.priority),
      );
    }
    return groups;
  }, [data]);

  const toggleDone = async (t: Task, touch?: { x: number; y: number }) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next: TaskStatus = t.status === "lesno" ? "not started" : "lesno";
    if (next === "lesno" && touch) celebrate(touch.x, touch.y, PRIORITY_COLOR[t.priority]);
    mutate((cur) => cur?.map((x) => (x.id === t.id ? { ...x, status: next } : x)) ?? null);
    await updateTask({ id: t.id, status: next });
    void refresh();
  };

  const openEdit = (t: Task) => {
    setForm({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      duePreset: null,
      dueDate: t.dueDate,
      notes: t.notes ?? "",
    });
  };

  const save = async () => {
    if (!form || !form.title.trim()) return;
    const dueDate = form.duePreset !== null ? presetToDate(form.duePreset) : form.dueDate;
    const payload = {
      title: form.title.trim(),
      priority: form.priority,
      status: form.status,
      dueDate,
      notes: form.notes.trim() || null,
    };
    setForm(null);
    if (form.id) {
      mutate(
        (cur) =>
          cur?.map((x) =>
            x.id === form.id ? { ...x, ...payload, notes: payload.notes } : x,
          ) ?? null,
      );
      await updateTask({ id: form.id, ...payload });
    } else {
      await createTask(payload);
    }
    void refresh();
  };

  const remove = async () => {
    if (!form?.id) return;
    const id = form.id;
    setForm(null);
    mutate((cur) => cur?.filter((x) => x.id !== id) ?? null);
    await deleteTask(id);
    void refresh();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Tasks"
        count={(data ?? []).filter((t) => t.status !== "lesno").length}
        paddingTop={insets.top + 8}
      />
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
          <EmptyState message="Nothing on the list. Tap + or ask JARVIS." />
        ) : null}
        {BUCKET_ORDER.map((bucket) => {
          const rows = grouped[bucket];
          if (!rows?.length) return null;
          const collapsed = bucket === "done" && !showDone;
          return (
            <View key={bucket}>
              <Pressable
                onPress={bucket === "done" ? () => setShowDone((v) => !v) : undefined}
                style={styles.bucketHeader}
              >
                <Text
                  style={[
                    styles.bucketLabel,
                    bucket === "overdue" && { color: colors.rec },
                  ]}
                >
                  {BUCKET_LABEL[bucket]} · {rows.length}
                  {bucket === "done" ? (collapsed ? "  ▸" : "  ▾") : ""}
                </Text>
              </Pressable>
              {!collapsed &&
                rows.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => openEdit(t)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  >
                    <Pressable
                      hitSlop={10}
                      onPress={(e) =>
                        void toggleDone(t, {
                          x: e.nativeEvent.pageX,
                          y: e.nativeEvent.pageY,
                        })
                      }
                      style={styles.ringWrap}
                    >
                      <View
                        style={[
                          styles.ring,
                          t.status === "lesno" && styles.ringDone,
                          { borderColor: PRIORITY_COLOR[t.priority] },
                        ]}
                      >
                        {t.status === "lesno" ? <Text style={styles.ringCheck}>✓</Text> : null}
                      </View>
                    </Pressable>
                    <View style={styles.rowBody}>
                      <Text
                        style={[styles.title, t.status === "lesno" && styles.titleDone]}
                        numberOfLines={2}
                      >
                        {t.title}
                      </Text>
                      <Text style={styles.meta}>
                        {t.priority}
                        {t.dueDate ? ` · ${t.dueDate === localDateString(0) ? "today" : t.dueDate}` : ""}
                        {t.status !== "lesno" && t.status !== "not started" ? ` · ${t.status}` : ""}
                        {t.projects.length ? ` · ${t.projects.map((p) => p.name).join(", ")}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                ))}
            </View>
          );
        })}
        <View style={{ height: 90 }} />
      </ScrollView>

      <Fab onPress={() => setForm({ ...EMPTY_FORM })} />

      <FormSheet
        visible={form !== null}
        title={form?.id ? "Edit task" : "New task"}
        onClose={() => setForm(null)}
        onSave={() => void save()}
        onDelete={form?.id ? () => void remove() : undefined}
      >
        {form ? (
          <>
            <FieldLabel>TITLE</FieldLabel>
            <Field
              value={form.title}
              onChangeText={(title) => setForm({ ...form, title })}
              placeholder="What needs doing?"
              autoFocus={!form.id}
            />
            <FieldLabel>PRIORITY</FieldLabel>
            <ChipRow
              options={PRIORITIES}
              value={form.priority}
              onChange={(priority) => setForm({ ...form, priority })}
            />
            <FieldLabel>DUE</FieldLabel>
            <ChipRow
              options={DUE_PRESETS}
              value={
                form.duePreset ??
                (form.dueDate === localDateString(0)
                  ? "today"
                  : form.dueDate === localDateString(1)
                    ? "tomorrow"
                    : form.dueDate === null
                      ? "none"
                      : null)
              }
              onChange={(duePreset) => setForm({ ...form, duePreset })}
            />
            {form.dueDate && form.duePreset === null ? (
              <Text style={styles.dueNote}>currently {form.dueDate}</Text>
            ) : null}
            <FieldLabel>STATUS</FieldLabel>
            <ChipRow
              options={STATUSES}
              value={form.status}
              onChange={(status) => setForm({ ...form, status })}
              labels={{ lesno: "done (lesno)" }}
            />
            <FieldLabel>NOTES</FieldLabel>
            <Field
              value={form.notes}
              onChangeText={(notes) => setForm({ ...form, notes })}
              placeholder="Optional notes…"
              multiline
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
  },
  bucketHeader: {
    marginTop: 16,
    marginBottom: 6,
  },
  bucketLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  ringWrap: {
    paddingVertical: 2,
  },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  ringDone: {
    backgroundColor: "rgba(127, 165, 124, 0.2)",
  },
  ringCheck: {
    color: "#7fa57c",
    fontSize: 13,
    fontFamily: mono,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 17,
    lineHeight: 22,
  },
  titleDone: {
    color: colors.textDim,
    textDecorationLine: "line-through",
  },
  meta: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
  },
  dueNote: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    marginTop: 6,
  },
});
