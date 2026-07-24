// Training — mobile week planner with full CRUD on activities (types and
// batches stay web-managed). Days of the current rolling week as sections,
// type-colored dots, tap the ring to mark done, tap a row to edit (type,
// title, date, status, planned duration/distance).

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
  createActivity,
  deleteActivity,
  getTraining,
  localDateString,
  TRAINING_STATUSES,
  updateActivity,
  type TrainingActivity,
  type TrainingData,
  type TrainingStatus,
} from "../lib/data";
import { oklchToHex } from "../lib/oklch";
import { celebrate } from "../components/celebrate";
import { useCollection } from "../lib/use-collection";
import { KiwiLoader } from "../components/KiwiLoader";
import { colors, mono, serif } from "../theme";
import {
  ChipRow,
  EmptyState,
  ErrorState,
  Fab,
  Field,
  FieldLabel,
  FormSheet,
  ScreenHeader,
} from "../components/shell";

const WINDOW_BACK = 1; // yesterday's leftovers
const WINDOW_FORWARD = 6;

function dayLabel(date: string): string {
  if (date === localDateString(0)) return "TODAY";
  if (date === localDateString(1)) return "TOMORROW";
  if (date === localDateString(-1)) return "YESTERDAY";
  const d = new Date(`${date}T12:00:00`);
  return d
    .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();
}

type DatePreset = "today" | "tomorrow" | "+2d" | "+3d";
const DATE_PRESETS: DatePreset[] = ["today", "tomorrow", "+2d", "+3d"];
const PRESET_OFFSET: Record<DatePreset, number> = { today: 0, tomorrow: 1, "+2d": 2, "+3d": 3 };

interface FormState {
  id: string | null;
  title: string;
  typeId: string | null;
  datePreset: DatePreset | null;
  date: string;
  status: TrainingStatus;
  durationMin: string;
  distanceKm: string;
}

export function TrainingScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const start = localDateString(-WINDOW_BACK);
  const end = localDateString(WINDOW_FORWARD);
  const { data, loading, error, refresh, mutate } = useCollection<TrainingData>(
    () => getTraining(start, end),
    active,
  );
  const [form, setForm] = useState<FormState | null>(null);

  const typeById = useMemo(() => {
    const map = new Map<string, { name: string; color: string; hasDistance: boolean }>();
    for (const t of data?.types ?? []) {
      map.set(t.id, { name: t.name, color: oklchToHex(t.color), hasDistance: t.hasDistance });
    }
    return map;
  }, [data]);

  const byDay = useMemo(() => {
    const groups = new Map<string, TrainingActivity[]>();
    for (const a of data?.activities ?? []) {
      const date = String(a.scheduledDate);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(a);
    }
    return [...groups.entries()].sort(([a], [z]) => a.localeCompare(z));
  }, [data]);

  const toggleDone = async (a: TrainingActivity, touch?: { x: number; y: number }) => {
    const status: TrainingStatus = a.status === "done" ? "planned" : "done";
    if (status === "done") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (status === "done" && touch) {
      celebrate(touch.x, touch.y, typeById.get(a.activityTypeId)?.color ?? "#7fa57c");
    }
    mutate((cur) =>
      cur
        ? {
            ...cur,
            activities: cur.activities.map((x) => (x.id === a.id ? { ...x, status } : x)),
          }
        : null,
    );
    await updateActivity({ id: a.id, status });
    void refresh();
  };

  const openEdit = (a: TrainingActivity) => {
    setForm({
      id: a.id,
      title: a.title,
      typeId: a.activityTypeId,
      datePreset: null,
      date: String(a.scheduledDate),
      status: a.status,
      durationMin: a.plannedDurationMin ? String(a.plannedDurationMin) : "",
      distanceKm: a.plannedDistanceKm ? String(a.plannedDistanceKm) : "",
    });
  };

  const save = async () => {
    if (!form || !form.title.trim() || !form.typeId) return;
    const date =
      form.datePreset !== null ? localDateString(PRESET_OFFSET[form.datePreset]) : form.date;
    const durationMin = parseInt(form.durationMin, 10);
    const distanceKm = parseFloat(form.distanceKm);
    const payload = {
      activityTypeId: form.typeId,
      title: form.title.trim(),
      scheduledDate: date,
      plannedDurationMin: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : null,
      plannedDistanceKm: Number.isFinite(distanceKm) && distanceKm >= 0 ? distanceKm : null,
    };
    const id = form.id;
    const status = form.status;
    setForm(null);
    if (id) {
      await updateActivity({ id, ...payload, status });
    } else {
      await createActivity(payload);
    }
    void refresh();
  };

  const remove = async () => {
    if (!form?.id) return;
    const id = form.id;
    setForm(null);
    mutate((cur) =>
      cur ? { ...cur, activities: cur.activities.filter((a) => a.id !== id) } : null,
    );
    await deleteActivity(id);
    void refresh();
  };

  const types = data?.types ?? [];

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Training"
        count={(data?.activities ?? []).filter((a) => a.status === "done").length}
        paddingTop={insets.top + 8}
      />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />
        }
      >
        {data === null && !error ? (
          <View style={{ paddingTop: 80, alignItems: "center" }}>
            <KiwiLoader size={34} />
          </View>
        ) : null}
        {data === null && error ? <ErrorState onRetry={() => void refresh()} /> : null}
        {data !== null && (data?.activities ?? []).length === 0 ? (
          <EmptyState message="No sessions this week. Plan one." />
        ) : null}
        {byDay.map(([date, rows]) => (
          <View key={date}>
            <Text style={[styles.dayHeader, date === localDateString(0) && { color: colors.accent }]}>
              {dayLabel(date)}
            </Text>
            {rows.map((a) => {
              const type = typeById.get(a.activityTypeId);
              const dead = a.status === "cancelled" || a.status === "skipped";
              return (
                <Pressable
                  key={a.id}
                  onPress={() => openEdit(a)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <Pressable
                    hitSlop={10}
                    onPress={(e) =>
                      void toggleDone(a, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
                    }
                  >
                    <View
                      style={[
                        styles.ring,
                        { borderColor: type?.color ?? colors.accent },
                        a.status === "done" && styles.ringDone,
                      ]}
                    >
                      {a.status === "done" ? <Text style={styles.ringCheck}>✓</Text> : null}
                      {dead ? <Text style={styles.ringDead}>—</Text> : null}
                    </View>
                  </Pressable>
                  <View style={styles.rowBody}>
                    <Text
                      style={[styles.title, (a.status === "done" || dead) && styles.titleDone]}
                      numberOfLines={1}
                    >
                      {a.title}
                    </Text>
                    <Text style={styles.meta}>
                      <Text style={{ color: type?.color ?? colors.textDim }}>
                        {type?.name ?? "?"}
                      </Text>
                      {a.plannedDurationMin ? ` · ${a.plannedDurationMin}min` : ""}
                      {a.plannedDistanceKm ? ` · ${a.plannedDistanceKm}km` : ""}
                      {dead ? ` · ${a.status}` : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <Fab
        onPress={() =>
          setForm({
            id: null,
            title: "",
            typeId: types[0]?.id ?? null,
            datePreset: "today",
            date: localDateString(0),
            status: "planned",
            durationMin: "",
            distanceKm: "",
          })
        }
      />

      <FormSheet
        visible={form !== null}
        title={form?.id ? "Edit session" : "New session"}
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
              placeholder="Tempo run"
              autoFocus={!form.id}
            />
            <FieldLabel>TYPE</FieldLabel>
            <View style={styles.typeRow}>
              {types.map((t) => {
                const selected = t.id === form.typeId;
                const hex = oklchToHex(t.color);
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setForm({ ...form, typeId: t.id })}
                    style={[
                      styles.typeChip,
                      { borderColor: selected ? hex : colors.hairline },
                      selected && { backgroundColor: `${hex}22` },
                    ]}
                  >
                    <View style={[styles.typeDot, { backgroundColor: hex }]} />
                    <Text style={[styles.typeLabel, selected && { color: colors.text }]}>
                      {t.name}
                    </Text>
                  </Pressable>
                );
              })}
              {types.length === 0 ? (
                <Text style={styles.noTypes}>Create activity types on the web first.</Text>
              ) : null}
            </View>
            <FieldLabel>DATE</FieldLabel>
            <ChipRow
              options={DATE_PRESETS}
              value={
                form.datePreset ??
                (form.date === localDateString(0)
                  ? "today"
                  : form.date === localDateString(1)
                    ? "tomorrow"
                    : null)
              }
              onChange={(datePreset) => setForm({ ...form, datePreset })}
            />
            {form.id ? (
              <>
                <FieldLabel>STATUS</FieldLabel>
                <ChipRow
                  options={TRAINING_STATUSES}
                  value={form.status}
                  onChange={(status) => setForm({ ...form, status })}
                />
              </>
            ) : null}
            <FieldLabel>PLANNED MINUTES</FieldLabel>
            <Field
              value={form.durationMin}
              onChangeText={(durationMin) => setForm({ ...form, durationMin })}
              placeholder="45"
            />
            <FieldLabel>PLANNED KM</FieldLabel>
            <Field
              value={form.distanceKm}
              onChangeText={(distanceKm) => setForm({ ...form, distanceKm })}
              placeholder="8"
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
  dayHeader: {
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
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
  ringDead: {
    color: colors.textDim,
    fontSize: 12,
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
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 12,
  },
  noTypes: {
    color: colors.textDim,
    fontFamily: serif,
    fontSize: 14,
    fontStyle: "italic",
  },
});
