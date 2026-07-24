import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ErrorState, ScreenHeader } from "../components/shell";
import { KiwiLoader } from "../components/KiwiLoader";
import { getCalendarEvents, localDateString, type CalendarEvent } from "../lib/data";
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

export function CalendarScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const { data, loading, error, refresh } = useCollection(() => getCalendarEvents(50), active);

  const calendarById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cal of data?.calendars ?? []) map.set(cal.id, cal.summary);
    return map;
  }, [data]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of data?.events ?? []) {
      const day = eventDayKey(event);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(event);
    }
    return [...groups.entries()].sort(([a], [z]) => a.localeCompare(z));
  }, [data]);

  const disconnected = data?.status === "not_connected" || data?.status === "revoked";

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Calendar"
        count={data?.events.length}
        paddingTop={insets.top + 8}
      />
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

        {data !== null && !disconnected && data.events.length === 0 ? (
          <EmptyState message="No upcoming events in the next 30 days." />
        ) : null}

        {grouped.map(([day, events]) => (
          <View key={day} style={styles.dayBlock}>
            <Text style={[styles.dayLabel, day === localDateString(0) && styles.dayToday]}>
              {dayTitle(day)} / {events.length}
            </Text>
            {events.map((event) => (
              <View key={`${event.calendarId}:${event.id}`} style={styles.card}>
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
              </View>
            ))}
          </View>
        ))}
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
  },
  loader: {
    paddingTop: 80,
    alignItems: "center",
  },
  notice: {
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 16,
    gap: 6,
  },
  noticeTitle: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 17,
  },
  noticeText: {
    color: sd.inkDull,
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 19,
  },
  dayBlock: {
    marginTop: 16,
  },
  dayLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  dayToday: {
    color: sd.accent,
  },
  card: {
    flexDirection: "row",
    gap: 12,
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 14,
    marginBottom: 10,
  },
  timeRail: {
    width: 64,
  },
  time: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  eventBody: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  meta: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
