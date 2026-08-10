// Full task creation sheet, mirroring the web TaskDetailPanel create mode:
// title first, then due date (Today / Tomorrow / Next week quick picks plus
// an inline month grid, web MoveToMenu parity), optional time, priority,
// project assignment, notes. Everything but the title is optional and the
// web default holds: no date lands the task in the Inbox.

import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { PRIORITIES, type Priority, type TaskCreateInput } from "@/api/device";
import { useProjects } from "@/data/useProjects";
import { useTheme } from "@/theme";
import { AppText, Button, Chip, Sheet } from "@/ui";

import { dayLabel, localTodayISO, nextWeekISO, shiftISO } from "./sections";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const TIME_PRESETS: { label: string; value: string }[] = [
  { label: "Morning", value: "09:00" },
  { label: "Noon", value: "12:00" },
  { label: "Evening", value: "18:00" },
];

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="micro" weight="medium" faint style={{ marginBottom: 6 }}>
      {children}
    </AppText>
  );
}

/** Inline month grid date picker — no native dependency, craft-quiet. */
function MonthGrid({
  selected,
  todayISO,
  onSelect,
}: {
  selected: string | null;
  todayISO: string;
  onSelect: (dateISO: string) => void;
}) {
  const t = useTheme();
  const seed = selected ?? todayISO;
  const [year, setYear] = useState(() => Number(seed.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(seed.slice(5, 7)) - 1);

  const shiftMonth = useCallback(
    (delta: number) => {
      const d = new Date(year, month + delta, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    },
    [year, month],
  );

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View
      style={{
        marginTop: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.c.edge,
        borderRadius: t.radius.panel,
        backgroundColor: t.c.surface,
        padding: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Pressable
          onPress={() => shiftMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
        >
          <ChevronLeft size={16} color={t.c.inkMuted} strokeWidth={2} />
        </Pressable>
        <AppText variant="meta" weight="medium">
          {`${MONTHS_LONG[month]} ${year}`}
        </AppText>
        <Pressable
          onPress={() => shiftMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
        >
          <ChevronRight size={16} color={t.c.inkMuted} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((w, i) => (
          <View key={`w-${i}`} style={{ width: `${100 / 7}%`, alignItems: "center" }}>
            <AppText variant="micro" mono faint>
              {w}
            </AppText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`e-${i}`} style={{ width: `${100 / 7}%`, height: 34 }} />;
          }
          const iso = isoOf(year, month, day);
          const isSelected = iso === selected;
          const isToday = iso === todayISO;
          return (
            <Pressable
              key={iso}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(iso);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${MONTHS_LONG[month]} ${day}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => ({
                width: `${100 / 7}%`,
                height: 34,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: t.radius.tile,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? t.c.selected : "transparent",
                  borderWidth: isSelected ? StyleSheet.hairlineWidth : 0,
                  borderColor: t.c.edgeStrong,
                }}
              >
                <AppText
                  variant="meta"
                  mono
                  weight={isSelected ? "medium" : "regular"}
                  color={isToday && !isSelected ? t.c.accent : t.c.ink}
                >
                  {String(day)}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface TaskCreateSheetProps {
  visible: boolean;
  /** Seed title from the composer draft. */
  initialTitle?: string;
  onClose: () => void;
  onCreate: (input: TaskCreateInput) => void;
}

export function TaskCreateSheet({
  visible,
  initialTitle,
  onClose,
  onCreate,
}: TaskCreateSheetProps) {
  const t = useTheme();
  const projectsQuery = useProjects();

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [timeText, setTimeText] = useState("");
  const [priority, setPriority] = useState<Priority>("P3");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Seed fresh state each time the sheet opens.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setTitle(initialTitle ?? "");
      setDueDate(null);
      setDueTime(null);
      setTimeText("");
      setPriority("P3");
      setProjectIds([]);
      setNotes("");
      setCalendarOpen(false);
    }
    wasVisible.current = visible;
  }, [visible, initialTitle]);

  const todayISO = localTodayISO();
  const quickPicks: { label: string; value: string }[] = [
    { label: "Today", value: todayISO },
    { label: "Tomorrow", value: shiftISO(todayISO, 1) },
    { label: "Next week", value: nextWeekISO(todayISO) },
  ];
  const isQuickPick = quickPicks.some((q) => q.value === dueDate);
  const customActive = dueDate !== null && !isQuickPick;

  const pickDate = useCallback((value: string | null) => {
    setDueDate(value);
    if (value === null) {
      // A time without a date is meaningless (web parity).
      setDueTime(null);
      setTimeText("");
    }
  }, []);

  const commitTime = useCallback(() => {
    const trimmed = timeText.trim();
    if (trimmed === "") {
      setDueTime(null);
      return;
    }
    if (!TIME_RE.test(trimmed)) {
      setTimeText(dueTime ?? "");
      return;
    }
    setDueTime(trimmed);
  }, [timeText, dueTime]);

  const toggleProject = useCallback((id: string) => {
    setProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const save = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCreate({
      title: trimmed,
      status: "not started",
      priority,
      dueDate,
      dueTime: dueDate ? dueTime : null,
      notes: notes.trim() || null,
      ...(projectIds.length ? { projectIds } : {}),
    });
    onClose();
  }, [title, priority, dueDate, dueTime, notes, projectIds, onCreate, onClose]);

  const areas = (projectsQuery.data ?? []).filter((a) => a.projects.length > 0);

  const inputBase = {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.c.edge,
    borderRadius: t.radius.btn,
    backgroundColor: t.c.surface,
    paddingHorizontal: 12,
    color: t.c.ink,
  } as const;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }}
      >
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={save}
          returnKeyType="done"
          autoFocus
          placeholder="Task title"
          placeholderTextColor={t.c.inkFaint}
          accessibilityLabel="Task title"
          style={{
            fontFamily: t.fonts.sansSemiBold,
            fontSize: t.type.subtitle.fontSize,
            color: t.c.ink,
            paddingVertical: 0,
          }}
        />

        <View>
          <FieldLabel>Due</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {quickPicks.map((opt) => (
              <Chip
                key={opt.label}
                label={opt.label}
                active={dueDate === opt.value}
                haptic
                onPress={() => {
                  setCalendarOpen(false);
                  pickDate(dueDate === opt.value ? null : opt.value);
                }}
              />
            ))}
            <Chip
              label={customActive ? dayLabel(dueDate!) : "Pick a date"}
              active={customActive}
              haptic
              onPress={() => setCalendarOpen((v) => !v)}
            />
          </View>
          {calendarOpen ? (
            <MonthGrid
              selected={dueDate}
              todayISO={todayISO}
              onSelect={(iso) => {
                pickDate(iso);
                setCalendarOpen(false);
              }}
            />
          ) : null}
          {dueDate === null ? (
            <AppText variant="micro" faint style={{ marginTop: 6 }}>
              No date · lands in the Inbox
            </AppText>
          ) : null}
        </View>

        {dueDate !== null ? (
          <View>
            <FieldLabel>Time</FieldLabel>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              {TIME_PRESETS.map((opt) => (
                <Chip
                  key={opt.label}
                  label={opt.label}
                  active={dueTime === opt.value}
                  haptic
                  onPress={() => {
                    const next = dueTime === opt.value ? null : opt.value;
                    setDueTime(next);
                    setTimeText(next ?? "");
                  }}
                />
              ))}
              <TextInput
                value={timeText}
                onChangeText={setTimeText}
                onEndEditing={commitTime}
                placeholder="HH:MM"
                placeholderTextColor={t.c.inkFaint}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Due time"
                style={[
                  inputBase,
                  {
                    fontFamily: t.fonts.mono,
                    fontSize: t.type.meta.fontSize,
                    height: 28,
                    width: 72,
                    paddingVertical: 0,
                    textAlign: "center",
                    borderRadius: 9999,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View>
          <FieldLabel>Priority</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PRIORITIES.map((p: Priority) => (
              <Chip
                key={p}
                label={p}
                active={priority === p}
                haptic
                onPress={() => setPriority(p)}
              />
            ))}
          </View>
        </View>

        {areas.length > 0 ? (
          <View>
            <FieldLabel>Project</FieldLabel>
            <View style={{ gap: 10 }}>
              {areas.map((area) => (
                <View key={area.id}>
                  <AppText variant="micro" faint style={{ marginBottom: 4 }}>
                    {area.emoji ? `${area.emoji} ${area.name}` : area.name}
                  </AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {area.projects.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.name}
                        active={projectIds.includes(p.id)}
                        haptic
                        onPress={() => toggleProject(p.id)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <FieldLabel>Notes</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note"
            placeholderTextColor={t.c.inkFaint}
            multiline
            accessibilityLabel="Notes"
            style={[
              inputBase,
              {
                fontFamily: t.fonts.sans,
                fontSize: t.type.body.fontSize,
                lineHeight: t.type.body.lineHeight,
                minHeight: 56,
                paddingTop: 10,
                paddingBottom: 10,
                textAlignVertical: "top",
              },
            ]}
          />
        </View>

        <Button
          label="Add task"
          size="lg"
          disabled={title.trim().length === 0}
          onPress={save}
        />
      </ScrollView>
    </Sheet>
  );
}
