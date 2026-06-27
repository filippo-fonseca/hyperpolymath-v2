// Tasks — mobile view with full CRUD. Grouped by due bucket (overdue /
// today / upcoming / no date / done), tap the ring to complete ("lesno"),
// tap a row to edit, long-press to enter multi-select mode, tap the
// reschedule glyph to quick-push a due date without opening the full form.

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
import { ProjectsSheet } from "../components/ProjectsSheet";
import { useCollection } from "../lib/use-collection";
import { colors, mono, serif } from "../theme";
import {
  ChipRow,
  EmptyState,
  Fab,
  Field,
  FieldLabel,
  FormSheet,
  HeaderButton,
  ScreenHeader,
  SearchBar,
} from "../components/shell";

const PRIORITY_COLOR: Record<Priority, string> = {
  "P∞": "#e54b4b",
  P1: "#d9a03f",
  P2: "#3aa6c4",
  P3: "#7d93a0",
};

type DuePreset = "today" | "tomorrow" | "next week" | "none";
const DUE_PRESETS: DuePreset[] = ["today", "tomorrow", "next week", "none"];

// Quick reschedule labels shown on the inline strip (shorter copy for compactness).
const QUICK_RESCHEDULE: { label: string; preset: DuePreset }[] = [
  { label: "tonight", preset: "today" },
  { label: "tmrw", preset: "tomorrow" },
  { label: "next wk", preset: "next week" },
  { label: "no date", preset: "none" },
];

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

// Snapshot of a task before a bulk mutation — used for the 5s undo.
interface BulkUndo {
  id: string;
  snapshots: Task[];
  label: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

// UndoBar — 5s countdown strip shown at screen bottom after a bulk op.
function UndoBar({ label, onUndo, onDismiss }: { label: string; onUndo: () => void; onDismiss: () => void }) {
  const [seconds, setSeconds] = useState(5);
  const dismissed = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          if (!dismissed.current) onDismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDismiss]);

  return (
    <View style={undoBarStyles.bar}>
      <Text style={undoBarStyles.label} numberOfLines={1}>{label}</Text>
      <Pressable
        hitSlop={8}
        onPress={() => {
          if (dismissed.current) return;
          dismissed.current = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onUndo();
        }}
        style={({ pressed }) => [undoBarStyles.btn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Undo"
      >
        <Text style={undoBarStyles.btnText}>UNDO ({seconds})</Text>
      </Pressable>
    </View>
  );
}

const undoBarStyles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0d1e26",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    flex: 1,
    color: colors.text,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  btnText: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1,
  },
});

// Bulk action bar shown at the bottom when tasks are selected.
function BulkBar({
  count,
  onReschedule,
  onPriority,
  onComplete,
  onDelete,
  onCancel,
}: {
  count: number;
  onReschedule: (preset: DuePreset) => void;
  onPriority: (p: Priority) => void;
  onComplete: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"main" | "reschedule" | "priority">("main");

  // Reset to main view when selection count changes (avoids stale sub-menu).
  useEffect(() => { setMode("main"); }, [count]);

  return (
    <View style={bulkStyles.wrap}>
      <View style={bulkStyles.countRow}>
        <Text style={bulkStyles.count}>{count} selected</Text>
        <Pressable onPress={onCancel} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Text style={bulkStyles.cancel}>✕ CANCEL</Text>
        </Pressable>
      </View>
      {mode === "main" && (
        <View style={bulkStyles.actionRow}>
          <Pressable onPress={() => setMode("reschedule")} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
            <Text style={bulkStyles.actionLabel}>RESCHEDULE</Text>
          </Pressable>
          <Pressable onPress={() => setMode("priority")} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
            <Text style={bulkStyles.actionLabel}>PRIORITY</Text>
          </Pressable>
          <Pressable onPress={onComplete} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
            <Text style={bulkStyles.actionLabel}>COMPLETE</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={({ pressed }) => [bulkStyles.action, bulkStyles.actionDanger, pressed && { opacity: 0.7 }]}>
            <Text style={[bulkStyles.actionLabel, bulkStyles.dangerText]}>DELETE</Text>
          </Pressable>
        </View>
      )}
      {mode === "reschedule" && (
        <View style={bulkStyles.actionRow}>
          {QUICK_RESCHEDULE.map(({ label, preset }) => (
            <Pressable key={preset} onPress={() => onReschedule(preset)} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
              <Text style={bulkStyles.actionLabel}>{label.toUpperCase()}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMode("main")} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
            <Text style={bulkStyles.actionLabel}>BACK</Text>
          </Pressable>
        </View>
      )}
      {mode === "priority" && (
        <View style={bulkStyles.actionRow}>
          {PRIORITIES.map((p) => (
            <Pressable key={p} onPress={() => onPriority(p)} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
              <Text style={[bulkStyles.actionLabel, { color: PRIORITY_COLOR[p] }]}>{p}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMode("main")} style={({ pressed }) => [bulkStyles.action, pressed && { opacity: 0.7 }]}>
            <Text style={bulkStyles.actionLabel}>BACK</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const bulkStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0a1820",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  cancel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  actionDanger: {
    borderColor: "rgba(229, 75, 75, 0.45)",
  },
  actionLabel: {
    color: colors.text,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  dangerText: {
    color: colors.rec,
  },
});

export function TasksScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const { data, loading, refresh, mutate } = useCollection(getTasks, active);
  const [form, setForm] = useState<FormState | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [query, setQuery] = useState("");

  // Multi-select state.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

  // Which task has its quick-reschedule strip open (collapses on any tap outside).
  const [quickRescheduleId, setQuickRescheduleId] = useState<string | null>(null);

  // 5s undo for bulk ops (one active undo at a time).
  const [pendingUndo, setPendingUndo] = useState<BulkUndo | null>(null);
  const pendingUndoRef = useRef<BulkUndo | null>(null);
  pendingUndoRef.current = pendingUndo;

  // Animated fade-in for the bulk bar.
  const bulkBarAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bulkBarAnim, {
      toValue: selectionMode ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [selectionMode, bulkBarAnim]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.notes?.toLowerCase().includes(q) ?? false) ||
        t.projects.some((p) => p.name.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of filtered) {
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
  }, [filtered]);

  const toggleDone = async (t: Task, touch?: { x: number; y: number }) => {
    const next: TaskStatus = t.status === "lesno" ? "not started" : "lesno";
    if (next === "lesno") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
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

  // Quick reschedule for a single task (via the inline strip).
  const quickReschedule = useCallback(
    async (t: Task, preset: DuePreset) => {
      const dueDate = presetToDate(preset);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuickRescheduleId(null);
      mutate((cur) => cur?.map((x) => (x.id === t.id ? { ...x, dueDate } : x)) ?? null);
      await updateTask({ id: t.id, dueDate });
      void refresh();
    },
    [mutate, refresh],
  );

  // Long-press a task row to enter selection mode.
  const handleLongPress = useCallback((t: Task) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickRescheduleId(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(t.id);
      return next;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds(new Set());
  }, []);

  // Dismiss any pending undo (commits the operation).
  const commitPendingUndo = useCallback(() => {
    const u = pendingUndoRef.current;
    if (u) {
      clearTimeout(u.timeoutId);
      setPendingUndo(null);
    }
  }, []);

  // Bulk reschedule.
  const bulkReschedule = useCallback(
    async (preset: DuePreset) => {
      const ids = Array.from(selectedIds);
      const snapshots = (data ?? []).filter((t) => ids.includes(t.id));
      const dueDate = presetToDate(preset);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      commitPendingUndo();
      cancelSelection();
      mutate((cur) => cur?.map((x) => (ids.includes(x.id) ? { ...x, dueDate } : x)) ?? null);

      const label = `Rescheduled ${ids.length} task${ids.length > 1 ? "s" : ""} to ${preset}`;
      const timeoutId = setTimeout(() => setPendingUndo(null), 5500);
      const undoEntry: BulkUndo = { id: String(Date.now()), snapshots, label, timeoutId };
      setPendingUndo(undoEntry);

      await Promise.all(ids.map((id) => updateTask({ id, dueDate })));
      void refresh();
    },
    [selectedIds, data, mutate, refresh, cancelSelection, commitPendingUndo],
  );

  // Bulk set priority.
  const bulkSetPriority = useCallback(
    async (priority: Priority) => {
      const ids = Array.from(selectedIds);
      const snapshots = (data ?? []).filter((t) => ids.includes(t.id));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      commitPendingUndo();
      cancelSelection();
      mutate((cur) => cur?.map((x) => (ids.includes(x.id) ? { ...x, priority } : x)) ?? null);

      const label = `Set ${ids.length} task${ids.length > 1 ? "s" : ""} to ${priority}`;
      const timeoutId = setTimeout(() => setPendingUndo(null), 5500);
      const undoEntry: BulkUndo = { id: String(Date.now()), snapshots, label, timeoutId };
      setPendingUndo(undoEntry);

      await Promise.all(ids.map((id) => updateTask({ id, priority })));
      void refresh();
    },
    [selectedIds, data, mutate, refresh, cancelSelection, commitPendingUndo],
  );

  // Bulk complete.
  const bulkComplete = useCallback(
    async () => {
      const ids = Array.from(selectedIds);
      const snapshots = (data ?? []).filter((t) => ids.includes(t.id));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      commitPendingUndo();
      cancelSelection();
      mutate((cur) => cur?.map((x) => (ids.includes(x.id) ? { ...x, status: "lesno" as TaskStatus } : x)) ?? null);

      const label = `Completed ${ids.length} task${ids.length > 1 ? "s" : ""}`;
      const timeoutId = setTimeout(() => setPendingUndo(null), 5500);
      const undoEntry: BulkUndo = { id: String(Date.now()), snapshots, label, timeoutId };
      setPendingUndo(undoEntry);

      await Promise.all(ids.map((id) => updateTask({ id, status: "lesno" })));
      void refresh();
    },
    [selectedIds, data, mutate, refresh, cancelSelection, commitPendingUndo],
  );

  // Bulk delete.
  const bulkDelete = useCallback(
    async () => {
      const ids = Array.from(selectedIds);
      const snapshots = (data ?? []).filter((t) => ids.includes(t.id));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      commitPendingUndo();
      cancelSelection();
      mutate((cur) => cur?.filter((x) => !ids.includes(x.id)) ?? null);

      const label = `Deleted ${ids.length} task${ids.length > 1 ? "s" : ""}`;
      const timeoutId = setTimeout(() => setPendingUndo(null), 5500);
      const undoEntry: BulkUndo = { id: String(Date.now()), snapshots, label, timeoutId };
      setPendingUndo(undoEntry);

      await Promise.all(ids.map((id) => deleteTask(id)));
      void refresh();
    },
    [selectedIds, data, mutate, refresh, cancelSelection, commitPendingUndo],
  );

  // Undo the last bulk op: re-insert all snapshots.
  const handleBulkUndo = useCallback(async () => {
    const u = pendingUndoRef.current;
    if (!u) return;
    clearTimeout(u.timeoutId);
    setPendingUndo(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Optimistically restore snapshots into the list.
    mutate((cur) => {
      if (!cur) return u.snapshots;
      const existing = new Set(cur.map((t) => t.id));
      const toRestore = u.snapshots.filter((s) => !existing.has(s.id));
      const restored = [...cur, ...toRestore].map((t) => {
        const snap = u.snapshots.find((s) => s.id === t.id);
        return snap ?? t;
      });
      return restored;
    });
    // Re-apply the original field values.
    await Promise.all(
      u.snapshots.map((snap) =>
        updateTask({
          id: snap.id,
          title: snap.title,
          priority: snap.priority,
          status: snap.status,
          dueDate: snap.dueDate,
          notes: snap.notes,
        }),
      ),
    );
    void refresh();
  }, [mutate, refresh]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Tasks"
        count={(data ?? []).filter((t) => t.status !== "lesno").length}
        paddingTop={insets.top + 8}
        right={<HeaderButton label="▦ projects" onPress={() => setShowProjects(true)} />}
      />
      {data && data.length > 0 ? (
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search tasks…" />
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.list, selectionMode && { paddingBottom: 140 }]}
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
        {data !== null && data.length > 0 && filtered.length === 0 ? (
          <EmptyState message={`No tasks match "${query.trim()}".`} />
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
                rows.map((t) => {
                  const isSelected = selectedIds.has(t.id);
                  const hasQuickReschedule = quickRescheduleId === t.id;

                  return (
                    <View key={t.id}>
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelect(t.id);
                            return;
                          }
                          if (hasQuickReschedule) {
                            setQuickRescheduleId(null);
                            return;
                          }
                          openEdit(t);
                        }}
                        onLongPress={() => handleLongPress(t)}
                        delayLongPress={350}
                        style={({ pressed }) => [
                          styles.row,
                          isSelected && styles.rowSelected,
                          pressed && !selectionMode && { opacity: 0.7 },
                        ]}
                      >
                        {selectionMode ? (
                          // Selection circle replaces the completion ring in batch mode.
                          <View style={[styles.selectionCircle, isSelected && styles.selectionCircleOn]}>
                            {isSelected ? <Text style={styles.selectionCheck}>✓</Text> : null}
                          </View>
                        ) : (
                          // Normal completion ring.
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
                        )}
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
                        {!selectionMode && t.status !== "lesno" ? (
                          // Quick-reschedule toggle glyph at the end of each active task row.
                          <Pressable
                            hitSlop={10}
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setQuickRescheduleId((prev) => (prev === t.id ? null : t.id));
                            }}
                            style={styles.rescheduleGlyph}
                            accessibilityRole="button"
                            accessibilityLabel="Quick reschedule"
                          >
                            <Text style={[styles.rescheduleGlyphText, hasQuickReschedule && { color: colors.accent }]}>
                              ◷
                            </Text>
                          </Pressable>
                        ) : null}
                      </Pressable>
                      {hasQuickReschedule ? (
                        // Inline quick-reschedule chip strip below the task row.
                        <View style={styles.quickStrip}>
                          {QUICK_RESCHEDULE.map(({ label, preset }) => (
                            <Pressable
                              key={preset}
                              onPress={() => void quickReschedule(t, preset)}
                              style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.7 }]}
                              accessibilityRole="button"
                              accessibilityLabel={`Reschedule to ${label}`}
                            >
                              <Text style={styles.quickChipLabel}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
            </View>
          );
        })}
        <View style={{ height: 90 }} />
      </ScrollView>

      {!selectionMode ? <Fab onPress={() => setForm({ ...EMPTY_FORM })} /> : null}

      <ProjectsSheet visible={showProjects} onClose={() => setShowProjects(false)} />

      {selectionMode ? (
        <BulkBar
          count={selectedIds.size}
          onReschedule={(preset) => void bulkReschedule(preset)}
          onPriority={(p) => void bulkSetPriority(p)}
          onComplete={() => void bulkComplete()}
          onDelete={() => void bulkDelete()}
          onCancel={cancelSelection}
        />
      ) : null}

      {pendingUndo ? (
        <UndoBar
          key={pendingUndo.id}
          label={pendingUndo.label}
          onUndo={() => void handleBulkUndo()}
          onDismiss={() => setPendingUndo(null)}
        />
      ) : null}

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
  rowSelected: {
    backgroundColor: "rgba(0, 212, 255, 0.05)",
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
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCircleOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(0, 212, 255, 0.18)",
  },
  selectionCheck: {
    color: colors.accent,
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
  rescheduleGlyph: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  rescheduleGlyphText: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 17,
  },
  quickStrip: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 36,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    backgroundColor: "rgba(0, 212, 255, 0.03)",
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickChipLabel: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
