// Habits — mobile view with full CRUD. Today's habits up top with a big
// check toggle and a 7-day dot strip; habits not scheduled today sit in a
// dimmed section. Tap a row to edit (name, icon, days, archive, delete).

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
  createHabit,
  deleteHabit,
  getHabits,
  localDateString,
  toggleHabit,
  updateHabit,
  type Habit,
  type HabitData,
} from "../lib/data";
import { celebrate } from "../components/celebrate";
import { useCollection } from "../lib/use-collection";
import { colors, mono, serif } from "../theme";
import {
  EmptyState,
  Fab,
  Field,
  FieldLabel,
  FormSheet,
  ScreenHeader,
} from "../components/shell";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

interface FormState {
  id: string | null;
  name: string;
  icon: string;
  daysOfWeek: boolean[];
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  icon: "",
  daysOfWeek: [true, true, true, true, true, true, true],
};

export function HabitsScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const weekStart = localDateString(-6);
  const today = localDateString(0);
  const { data, loading, refresh, mutate } = useCollection<HabitData>(
    () => getHabits(weekStart, today),
    active,
  );
  const [form, setForm] = useState<FormState | null>(null);

  const todayDow = new Date().getDay();
  const checkedToday = useMemo(() => {
    const set = new Set<string>();
    for (const c of data?.completions ?? []) {
      if (c.completedDate === today) set.add(c.habitId);
    }
    return set;
  }, [data, today]);

  const last7 = useMemo(() => {
    // habitId → set of completed dates in window
    const map = new Map<string, Set<string>>();
    for (const c of data?.completions ?? []) {
      if (!map.has(c.habitId)) map.set(c.habitId, new Set());
      map.get(c.habitId)!.add(c.completedDate);
    }
    return map;
  }, [data]);

  const scheduledToday = (h: Habit) => h.daysOfWeek[todayDow] !== false;

  const toggle = async (h: Habit, touch?: { x: number; y: number }) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const completed = !checkedToday.has(h.id);
    if (completed && touch) celebrate(touch.x, touch.y, "#7fa57c");
    mutate((cur) =>
      cur
        ? {
            ...cur,
            completions: completed
              ? [...cur.completions, { habitId: h.id, completedDate: today }]
              : cur.completions.filter(
                  (c) => !(c.habitId === h.id && c.completedDate === today),
                ),
          }
        : null,
    );
    await toggleHabit({ habitId: h.id, completedDate: today, completed });
    void refresh();
  };

  const save = async () => {
    if (!form || !form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      icon: form.icon.trim() || null,
      daysOfWeek: form.daysOfWeek,
    };
    const id = form.id;
    setForm(null);
    if (id) {
      mutate((cur) =>
        cur
          ? {
              ...cur,
              habits: cur.habits.map((h) =>
                h.id === id ? { ...h, ...payload } : h,
              ),
            }
          : null,
      );
      await updateHabit({ id, ...payload });
    } else {
      await createHabit(payload);
    }
    void refresh();
  };

  const remove = async () => {
    if (!form?.id) return;
    const id = form.id;
    setForm(null);
    mutate((cur) =>
      cur ? { ...cur, habits: cur.habits.filter((h) => h.id !== id) } : null,
    );
    await deleteHabit(id);
    void refresh();
  };

  const renderRow = (h: Habit, dimmed: boolean) => {
    const checked = checkedToday.has(h.id);
    const dates = last7.get(h.id);
    return (
      <Pressable
        key={h.id}
        onPress={() =>
          setForm({
            id: h.id,
            name: h.name,
            icon: h.icon ?? "",
            daysOfWeek: [...h.daysOfWeek],
          })
        }
        style={({ pressed }) => [styles.row, dimmed && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>
            {h.icon ? `${h.icon}  ` : ""}
            {h.name}
          </Text>
          <View style={styles.dotStrip}>
            {Array.from({ length: 7 }, (_, i) => {
              const date = localDateString(i - 6);
              const hit = dates?.has(date);
              return (
                <View
                  key={date}
                  style={[styles.dayDot, hit && styles.dayDotHit, date === today && styles.dayDotToday]}
                />
              );
            })}
          </View>
        </View>
        <Pressable
          hitSlop={10}
          onPress={(e) => void toggle(h, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
        >
          <View style={[styles.check, checked && styles.checkOn]}>
            {checked ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
        </Pressable>
      </Pressable>
    );
  };

  const habits = data?.habits ?? [];
  const todays = habits.filter(scheduledToday);
  const others = habits.filter((h) => !scheduledToday(h));

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Habits"
        count={todays.filter((h) => checkedToday.has(h.id)).length}
        paddingTop={insets.top + 8}
      />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />
        }
      >
        {data !== null && habits.length === 0 ? (
          <EmptyState message="No habits yet. Build the machine." />
        ) : null}
        {todays.length ? <Text style={styles.section}>TODAY · {todays.length}</Text> : null}
        {todays.map((h) => renderRow(h, false))}
        {others.length ? <Text style={styles.section}>NOT SCHEDULED TODAY</Text> : null}
        {others.map((h) => renderRow(h, true))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <Fab onPress={() => setForm({ ...EMPTY_FORM, daysOfWeek: [...EMPTY_FORM.daysOfWeek] })} />

      <FormSheet
        visible={form !== null}
        title={form?.id ? "Edit habit" : "New habit"}
        onClose={() => setForm(null)}
        onSave={() => void save()}
        onDelete={form?.id ? () => void remove() : undefined}
      >
        {form ? (
          <>
            <FieldLabel>NAME</FieldLabel>
            <Field
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              placeholder="Read 20 pages"
              autoFocus={!form.id}
            />
            <FieldLabel>ICON (EMOJI, OPTIONAL)</FieldLabel>
            <Field
              value={form.icon}
              onChangeText={(icon) => setForm({ ...form, icon })}
              placeholder="📖"
            />
            <FieldLabel>DAYS</FieldLabel>
            <View style={styles.daysRow}>
              {DAY_LETTERS.map((letter, i) => {
                const on = form.daysOfWeek[i];
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      const next = [...form.daysOfWeek];
                      next[i] = !next[i];
                      setForm({ ...form, daysOfWeek: next });
                    }}
                    style={[styles.dayToggle, on && styles.dayToggleOn]}
                  >
                    <Text style={[styles.dayToggleLabel, on && { color: colors.accent }]}>
                      {letter}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
  section: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  name: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 17,
  },
  dotStrip: {
    flexDirection: "row",
    gap: 6,
  },
  dayDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "rgba(148, 197, 218, 0.18)",
  },
  dayDotHit: {
    backgroundColor: "#7fa57c",
  },
  dayDotToday: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: "#7fa57c",
    backgroundColor: "rgba(127, 165, 124, 0.18)",
  },
  checkMark: {
    color: "#7fa57c",
    fontSize: 16,
    fontFamily: mono,
  },
  daysRow: {
    flexDirection: "row",
    gap: 8,
  },
  dayToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToggleOn: {
    borderColor: colors.accent,
    backgroundColor: "rgba(0, 212, 255, 0.10)",
  },
  dayToggleLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 13,
  },
});
