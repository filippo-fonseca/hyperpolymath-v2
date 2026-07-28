import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ErrorState, HeaderButton, ScreenHeader } from "../components/shell";
import { KiwiLoader } from "../components/KiwiLoader";
import {
  archiveCalendarEvents,
  getCalendarEvents,
  localDateString,
  type CalendarEvent,
} from "../lib/data";
import { useCollection } from "../lib/use-collection";
import { font, sd } from "../theme";

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eventDayKey(event: CalendarEvent): string {
  if (event.allDay) return event.start;
  return localYmd(new Date(event.start));
}

function dayTitle(day: string): string {
  const today = localDateString(0);
  if (day === today) return "TODAY";
  if (day === localDateString(1)) return "TOMORROW";
  const d = new Date(`${day}T12:00:00`);
  return d
    .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();
}

function timeLabel(event: CalendarEvent): string {
  if (event.allDay) return "all day";
  const start = new Date(event.start);
  return start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function eventKey(e: CalendarEvent): string {
  return `${e.calendarId}::${e.id}`;
}

export function CalendarScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const [cleanup, setCleanup] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(true);
  const [rangeFrom, setRangeFrom] = useState(() => localDateString(-30));
  const [rangeTo, setRangeTo] = useState(() => localDateString(0));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  const fetcher = useCallback(() => {
    if (cleanup) {
      return getCalendarEvents(200, {
        timeMin: `${rangeFrom}T00:00:00.000Z`,
        timeMax: `${rangeTo}T23:59:59.999Z`,
        overdue: onlyOverdue,
      });
    }
    return getCalendarEvents(50);
  }, [cleanup, onlyOverdue, rangeFrom, rangeTo]);

  const { data, loading, error, refresh } = useCollection(fetcher, active);

  // Refetch when cleanup filters change (useCollection only tracks active).
  useEffect(() => {
    if (!active || !cleanup) return;
    void refresh();
  }, [active, cleanup, onlyOverdue, rangeFrom, rangeTo, refresh]);

  const calendarById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cal of data?.calendars ?? []) map.set(cal.id, cal.summary);
    return map;
  }, [data]);

  const events = data?.events ?? [];

  const grouped = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const day = eventDayKey(event);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(event);
    }
    return [...groups.entries()].sort(([a], [z]) => a.localeCompare(z));
  }, [events]);

  const disconnected = data?.status === "not_connected" || data?.status === "revoked";

  const toggle = (key: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (events.length === 0) return;
    const keys = events.map(eventKey);
    const allOn = keys.every((k) => selected.has(k));
    setSelected(allOn ? new Set() : new Set(keys));
  };

  const archiveSelected = async () => {
    const items = events
      .filter((e) => selected.has(eventKey(e)))
      .map((e) => ({ calendarId: e.calendarId, eventId: e.id }));
    if (items.length === 0) return;
    const res = await archiveCalendarEvents(items);
    if (!res) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelected(new Set());
    setConfirm(false);
    void refresh();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Calendar"
        count={data?.events.length}
        paddingTop={insets.top + 8}
        right={
          <HeaderButton
            label={cleanup ? "done" : "archive"}
            onPress={() => {
              setCleanup((v) => !v);
              setSelected(new Set());
              setConfirm(false);
            }}
          />
        }
      />

      {cleanup ? (
        <View style={styles.cleanupBar}>
          <Pressable
            onPress={() => setOnlyOverdue((v) => !v)}
            style={[styles.chip, onlyOverdue && styles.chipOn]}
          >
            <Text style={[styles.chipText, onlyOverdue && styles.chipTextOn]}>OVERDUE</Text>
          </Pressable>
          <TextInput
            value={rangeFrom}
            onChangeText={setRangeFrom}
            placeholder="from"
            placeholderTextColor={sd.inkFaint}
            style={styles.dateInput}
            autoCapitalize="none"
          />
          <Text style={styles.rangeSep}>→</Text>
          <TextInput
            value={rangeTo}
            onChangeText={setRangeTo}
            placeholder="to"
            placeholderTextColor={sd.inkFaint}
            style={styles.dateInput}
            autoCapitalize="none"
          />
          <Pressable onPress={selectAll} style={styles.chip}>
            <Text style={styles.chipText}>ALL</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setRangeFrom(localDateString(-90));
              setRangeTo(localDateString(0));
              setOnlyOverdue(true);
              void refresh();
            }}
            style={styles.chip}
          >
            <Text style={styles.chipText}>90D</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.list}
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

        {disconnected ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>
              {data?.status === "revoked" ? "Reconnect Google Calendar" : "Calendar not connected"}
            </Text>
            <Text style={styles.noticeText}>
              Connect Google Calendar on the web settings page, then pull to refresh here.
            </Text>
          </View>
        ) : null}

        {data !== null && !disconnected && events.length === 0 ? (
          <EmptyState
            message={
              cleanup
                ? "No events in this range."
                : "No upcoming events in the next 30 days."
            }
          />
        ) : null}

        {grouped.map(([day, dayEvents]) => (
          <View key={day} style={styles.dayBlock}>
            <Text style={[styles.dayLabel, day === localDateString(0) && styles.dayToday]}>
              {dayTitle(day)} / {dayEvents.length}
            </Text>
            {dayEvents.map((event) => {
              const key = eventKey(event);
              const on = selected.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={cleanup ? () => toggle(key) : undefined}
                  style={[styles.card, cleanup && on && styles.cardSelected]}
                >
                  {cleanup ? (
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                  ) : null}
                  <View style={styles.timeRail}>
                    <Text style={styles.time}>{timeLabel(event)}</Text>
                  </View>
                  <View style={styles.eventBody}>
                    <Text style={styles.title} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {calendarById.get(event.calendarId) ?? event.calendarId}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={{ height: cleanup ? 120 : 90 }} />
      </ScrollView>

      {cleanup && selected.size > 0 ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selected.size} selected</Text>
          {confirm ? (
            <>
              <Pressable onPress={() => void archiveSelected()} style={styles.bulkDanger}>
                <Text style={styles.bulkDangerText}>CONFIRM ARCHIVE</Text>
              </Pressable>
              <Pressable onPress={() => setConfirm(false)}>
                <Text style={styles.bulkCancel}>CANCEL</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setConfirm(true)} style={styles.bulkAction}>
              <Text style={styles.bulkActionText}>ARCHIVE</Text>
            </Pressable>
          )}
        </View>
      ) : null}
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
  },
  loader: {
    paddingTop: 80,
    alignItems: "center",
  },
  notice: {
    marginTop: 24,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: sd.line,
    backgroundColor: sd.box,
    gap: 6,
  },
  noticeTitle: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 15,
  },
  noticeText: {
    color: sd.inkDull,
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  dayBlock: {
    marginTop: 18,
  },
  dayLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  dayToday: {
    color: sd.accent,
  },
  card: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sd.line,
    alignItems: "flex-start",
  },
  cardSelected: {
    backgroundColor: "rgba(0, 212, 255, 0.06)",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: sd.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkOn: {
    borderColor: sd.accent,
    backgroundColor: "rgba(0, 212, 255, 0.2)",
  },
  checkMark: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 12,
  },
  timeRail: {
    width: 64,
  },
  time: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 11,
  },
  eventBody: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 15,
  },
  meta: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
  },
  cleanupBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: sd.line,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chipOn: {
    borderColor: sd.accent,
  },
  chipText: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  chipTextOn: {
    color: sd.accent,
  },
  dateInput: {
    minWidth: 96,
    borderWidth: 1,
    borderColor: sd.line,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: sd.ink,
    fontFamily: font.mono,
    fontSize: 11,
  },
  rangeSep: {
    color: sd.inkFaint,
    fontFamily: font.mono,
  },
  bulkBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: sd.line,
    backgroundColor: sd.app,
  },
  bulkCount: {
    flex: 1,
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  bulkAction: {
    borderWidth: 1,
    borderColor: sd.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkActionText: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  bulkDanger: {
    borderWidth: 1,
    borderColor: "#e54b4b",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkDangerText: {
    color: "#e54b4b",
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  bulkCancel: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
});
