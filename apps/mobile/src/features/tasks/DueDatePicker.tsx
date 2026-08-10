import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";

import { REMINDER_OFFSETS, shortReminderLabel } from "@/lib/reminders";
import { useTheme } from "@/theme";
import { AppText, Button, Chip, PressableRow, Sheet } from "@/ui";

import { dayLabel, localTodayISO, shiftISO, weekendISO } from "./sections";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const TIME_PRESETS: { label: string; value: string }[] = [
  { label: "Morning", value: "09:00" },
  { label: "Noon", value: "12:00" },
  { label: "Evening", value: "18:00" },
];

const MONTH_NAMES = [
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

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** YMD from explicit parts — never new Date("YYYY-MM-DD") (UTC drift). */
function ymd(y: number, m0: number, d: number): string {
  const dt = new Date(y, m0, d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

interface Cell {
  date: string;
  day: number;
  inMonth: boolean;
}

/** Sunday-anchored month grid including faint adjacent-month days. */
function monthGrid(year: number, month0: number): Cell[][] {
  const firstDow = new Date(year, month0, 1).getDay();
  const weeks: Cell[][] = [];
  let cursor = 1 - firstDow;
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  while (cursor <= lastDay) {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i += 1, cursor += 1) {
      const dt = new Date(year, month0, cursor);
      week.push({
        date: ymd(year, month0, cursor),
        day: dt.getDate(),
        inMonth: dt.getMonth() === month0,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export interface DueValue {
  dueDate: string | null;
  dueTime: string | null;
  reminderOffsetsMin: number[];
}

export interface DueDatePickerProps {
  visible: boolean;
  onClose: () => void;
  value: DueValue;
  /** Partial patch; the caller owns the mutation. Clearing the date always
   *  arrives with dueTime: null and reminderOffsetsMin: [] in the same patch. */
  onChange: (patch: Partial<DueValue>) => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <AppText variant="micro" weight="medium" faint style={{ marginBottom: 8 }}>
      {children}
    </AppText>
  );
}

/**
 * Notion-style due sheet: quick presets, a month calendar, time-of-day,
 * and the reminder-offset ladder. Pure controlled component — state lives
 * in the task row, every tap emits one onChange patch.
 */
export function DueDatePicker({ visible, onClose, value, onChange }: DueDatePickerProps) {
  const t = useTheme();
  const todayISO = localTodayISO();

  // The visible month follows the selection (or today), but paging ‹ › is
  // free navigation and must not move the selection itself.
  const anchor = value.dueDate ?? todayISO;
  const [viewYear, setViewYear] = useState(() => Number(anchor.slice(0, 4)));
  const [viewMonth0, setViewMonth0] = useState(() => Number(anchor.slice(5, 7)) - 1);
  useEffect(() => {
    if (!visible) return;
    const a = value.dueDate ?? localTodayISO();
    setViewYear(Number(a.slice(0, 4)));
    setViewMonth0(Number(a.slice(5, 7)) - 1);
  }, [visible, value.dueDate]);

  const [timeText, setTimeText] = useState(value.dueTime ?? "");
  useEffect(() => {
    setTimeText(value.dueTime ?? "");
  }, [value.dueTime]);

  const commitTime = useCallback(() => {
    const trimmed = timeText.trim();
    if (trimmed === "") {
      if (value.dueTime !== null) onChange({ dueTime: null });
      return;
    }
    if (!TIME_RE.test(trimmed)) {
      setTimeText(value.dueTime ?? "");
      return;
    }
    if (trimmed !== value.dueTime) onChange({ dueTime: trimmed });
  }, [timeText, value.dueTime, onChange]);

  const weeks = useMemo(() => monthGrid(viewYear, viewMonth0), [viewYear, viewMonth0]);

  const page = (delta: number) => {
    const next = new Date(viewYear, viewMonth0 + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth0(next.getMonth());
  };

  const pick = (date: string) => {
    onChange({ dueDate: date });
    setViewYear(Number(date.slice(0, 4)));
    setViewMonth0(Number(date.slice(5, 7)) - 1);
  };

  const presets: { label: string; date: string }[] = [
    { label: "Today", date: todayISO },
    { label: "Tomorrow", date: shiftISO(todayISO, 1) },
    { label: "Weekend", date: weekendISO(todayISO) },
  ];

  const selectedInk = t.scheme === "light" ? "#ffffff" : t.c.canvas;
  const hasDate = value.dueDate !== null;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.9}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 18 }}
      >
        {/* Quick presets — resolved date under each label, Notion-style. */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {presets.map((p) => {
            const active = value.dueDate === p.date;
            return (
              <PressableRow
                key={p.label}
                haptic
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => pick(p.date)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: t.radius.btn,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? t.c.edgeStrong : t.c.edge,
                  backgroundColor: active ? t.c.selected : t.c.surfaceRaised,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                }}
              >
                <AppText
                  variant="meta"
                  weight="medium"
                  color={active ? t.c.ink : t.c.inkMuted}
                >
                  {p.label}
                </AppText>
                <AppText variant="micro" mono faint>
                  {dayLabel(p.date)}
                </AppText>
              </PressableRow>
            );
          })}
        </View>

        {/* Month header + pager. */}
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <AppText variant="subtitle" weight="semibold">
              {`${MONTH_NAMES[viewMonth0]} ${viewYear}`}
            </AppText>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <PressableRow
                haptic
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => page(-1)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.tile,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronLeft size={18} color={t.c.inkMuted} strokeWidth={2} />
              </PressableRow>
              <PressableRow
                haptic
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() => page(1)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.tile,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronRight size={18} color={t.c.inkMuted} strokeWidth={2} />
              </PressableRow>
            </View>
          </View>

          {/* DOW header. */}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {DOW.map((d, i) => (
              <View key={`${d}-${i}`} style={{ flex: 1, alignItems: "center" }}>
                <AppText variant="micro" mono faint>
                  {d}
                </AppText>
              </View>
            ))}
          </View>

          {/* Month grid. */}
          <View style={{ gap: 2 }}>
            {weeks.map((week) => (
              <View key={week[0]!.date} style={{ flexDirection: "row", gap: 2 }}>
                {week.map((cell) => {
                  const selected = value.dueDate === cell.date;
                  const isToday = cell.date === todayISO;
                  return (
                    <PressableRow
                      key={cell.date}
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={cell.date}
                      accessibilityState={{ selected }}
                      onPress={() => pick(cell.date)}
                      style={{
                        flex: 1,
                        aspectRatio: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: t.radius.tile,
                        backgroundColor: selected ? t.c.accent : "transparent",
                        borderWidth: isToday && !selected ? 1.5 : 0,
                        borderColor:
                          isToday && !selected ? t.c.accent : "transparent",
                      }}
                    >
                      <AppText
                        variant="meta"
                        mono
                        weight={selected || isToday ? "medium" : "regular"}
                        color={
                          selected
                            ? selectedInk
                            : cell.inMonth
                              ? t.c.ink
                              : t.c.inkFaint
                        }
                      >
                        {String(cell.day)}
                      </AppText>
                    </PressableRow>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Time-of-day — only meaningful once a date exists. */}
        {hasDate ? (
          <View>
            <SectionLabel>Time</SectionLabel>
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
                  active={value.dueTime === opt.value}
                  haptic
                  onPress={() =>
                    onChange({
                      dueTime: value.dueTime === opt.value ? null : opt.value,
                    })
                  }
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
                style={{
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: t.c.edge,
                  borderRadius: 9999,
                  backgroundColor: t.c.surface,
                  color: t.c.ink,
                  fontFamily: t.fonts.mono,
                  fontSize: t.type.meta.fontSize,
                  height: 28,
                  width: 72,
                  paddingVertical: 0,
                  paddingHorizontal: 12,
                  textAlign: "center",
                }}
              />
            </View>
          </View>
        ) : null}

        {/* Reminder ladder — multi-select, rides the date. */}
        {hasDate ? (
          <View>
            <SectionLabel>Reminders</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {REMINDER_OFFSETS.map((o) => {
                const active = value.reminderOffsetsMin.includes(o.minutes);
                return (
                  <Chip
                    key={o.minutes}
                    label={shortReminderLabel(o.minutes)}
                    active={active}
                    haptic
                    onPress={() =>
                      onChange({
                        reminderOffsetsMin: active
                          ? value.reminderOffsetsMin.filter((m) => m !== o.minutes)
                          : [...value.reminderOffsetsMin, o.minutes].sort(
                              (a, b) => a - b,
                            ),
                      })
                    }
                  />
                );
              })}
            </View>
            <AppText variant="micro" faint style={{ marginTop: 8 }}>
              {value.dueTime
                ? `Before ${value.dueTime} on the due day.`
                : "Before 09:00 on the due day."}
            </AppText>
          </View>
        ) : null}

        {hasDate ? (
          <Button
            label="Clear due date"
            variant="ghost"
            size="sm"
            onPress={() =>
              onChange({ dueDate: null, dueTime: null, reminderOffsetsMin: [] })
            }
            style={{ alignSelf: "flex-start" }}
          />
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
