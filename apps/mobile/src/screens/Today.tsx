import { useMemo, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ScreenHeader } from "../components/shell";
import { KiwiLoader } from "../components/KiwiLoader";
import {
  getCalendarEvents,
  getCaptures,
  getHabits,
  getTasks,
  localDateString,
  type CalendarData,
  type Capture,
  type HabitData,
  type Task,
} from "../lib/data";
import { useCollection } from "../lib/use-collection";
import { font, sd } from "../theme";

interface TodayData {
  tasks: Task[];
  habits: HabitData;
  captures: Capture[];
  calendar: CalendarData;
}

const EMPTY_HABITS: HabitData = { habits: [], completions: [] };
const EMPTY_CALENDAR: CalendarData = { status: "connected", events: [], calendars: [] };

async function getTodayData(): Promise<TodayData | null> {
  const today = localDateString(0);
  const [tasks, habits, captures, calendar] = await Promise.all([
    getTasks(),
    getHabits(today, today),
    getCaptures(),
    getCalendarEvents(5),
  ]);

  return {
    tasks: tasks ?? [],
    habits: habits ?? EMPTY_HABITS,
    captures: captures ?? [],
    calendar: calendar ?? EMPTY_CALENDAR,
  };
}

function taskRank(task: Task): string {
  if (task.dueDate) return task.dueDate;
  return "9999-99-99";
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

function eventTime(start: string, allDay: boolean): string {
  if (allDay) return "all day";
  return new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TodayScreen({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const today = localDateString(0);
  const { data, loading, refresh } = useCollection(getTodayData, active);

  const openTasks = data?.tasks.filter((t) => t.status !== "lesno") ?? [];
  const overdueCount = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const todayCount = openTasks.filter((t) => t.dueDate === today).length;

  const nextTasks = useMemo(
    () =>
      [...openTasks]
        .sort((a, z) => taskRank(a).localeCompare(taskRank(z)) || a.title.localeCompare(z.title))
        .slice(0, 5),
    [openTasks],
  );

  const todayDow = new Date().getDay();
  const todaysHabits = (data?.habits.habits ?? []).filter((h) => h.daysOfWeek[todayDow] !== false);
  const completedHabits = new Set(
    (data?.habits.completions ?? [])
      .filter((c) => c.completedDate === today)
      .map((c) => c.habitId),
  );
  const habitDone = todaysHabits.filter((h) => completedHabits.has(h.id)).length;

  const recentCaptures = (data?.captures ?? []).slice(0, 3);
  const events = data?.calendar.events ?? [];

  return (
    <View style={styles.root}>
      <ScreenHeader title="Today" paddingTop={insets.top + 8} />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={sd.accent} />
        }
      >
        {data === null ? (
          <View style={styles.loader}>
            <KiwiLoader size={34} />
          </View>
        ) : null}

        {data !== null ? (
          <>
            <View style={styles.summaryGrid}>
              <MetricCard label="OVERDUE" value={overdueCount} tone={overdueCount > 0 ? "bad" : "muted"} />
              <MetricCard label="DUE TODAY" value={todayCount} tone="accent" />
              <MetricCard label="HABITS" value={`${habitDone}/${todaysHabits.length}`} tone="good" />
            </View>

            <Section title="NEXT TASKS">
              {nextTasks.length === 0 ? (
                <EmptyState message="No open tasks. Ask JARVIS for the next move." />
              ) : (
                nextTasks.map((task) => (
                  <View key={task.id} style={styles.row}>
                    <View style={[styles.dot, task.dueDate && task.dueDate < today && styles.dotBad]} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {task.dueDate ? (task.dueDate === today ? "today" : task.dueDate) : "no date"}
                        {" / "}
                        {task.priority}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Section>

            <Section title="CALENDAR">
              {data.calendar.status !== "connected" ? (
                <Text style={styles.muted}>Connect Google Calendar on web settings.</Text>
              ) : events.length === 0 ? (
                <Text style={styles.muted}>No events coming up.</Text>
              ) : (
                events.slice(0, 3).map((event) => (
                  <View key={`${event.calendarId}:${event.id}`} style={styles.eventRow}>
                    <Text style={styles.eventTime}>{eventTime(event.start, event.allDay)}</Text>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                  </View>
                ))
              )}
            </Section>

            <Section title="TODAY'S HABITS">
              {todaysHabits.length === 0 ? (
                <Text style={styles.muted}>No habits scheduled today.</Text>
              ) : (
                todaysHabits.slice(0, 5).map((habit) => {
                  const done = completedHabits.has(habit.id);
                  return (
                    <View key={habit.id} style={styles.habitRow}>
                      <Text style={[styles.habitCheck, done && styles.habitCheckOn]}>
                        {done ? "DONE" : "TODO"}
                      </Text>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {habit.icon ? `${habit.icon}  ` : ""}
                        {habit.name}
                      </Text>
                    </View>
                  );
                })
              )}
            </Section>

            <Section title="RECENT CAPTURES">
              {recentCaptures.length === 0 ? (
                <Text style={styles.muted}>No recent captures.</Text>
              ) : (
                recentCaptures.map((capture) => (
                  <View key={capture.id} style={styles.captureCard}>
                    <Text style={styles.captureText} numberOfLines={3}>
                      {capture.content}
                    </Text>
                    <Text style={styles.rowMeta}>{relativeTime(capture.createdAt)}</Text>
                  </View>
                ))
              )}
            </Section>
          </>
        ) : null}
        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "accent" | "bad" | "good" | "muted";
}) {
  const color =
    tone === "accent" ? sd.accent : tone === "bad" ? sd.coral : tone === "good" ? sd.sage : sd.inkDull;
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    flex: 1,
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 12,
    gap: 6,
  },
  metricLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  metricValue: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  section: {
    marginTop: 22,
    gap: 8,
  },
  sectionTitle: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 13,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: sd.accent,
  },
  dotBad: {
    backgroundColor: sd.coral,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 15,
    lineHeight: 19,
  },
  rowMeta: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sd.line,
  },
  eventTime: {
    width: 66,
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 10,
  },
  eventTitle: {
    flex: 1,
    color: sd.ink,
    fontFamily: font.sans,
    fontSize: 15,
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  habitCheck: {
    width: 44,
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  habitCheckOn: {
    color: sd.sage,
  },
  captureCard: {
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 13,
    gap: 6,
  },
  captureText: {
    color: sd.ink,
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 20,
  },
  muted: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 14,
  },
});
