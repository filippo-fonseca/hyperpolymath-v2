import {
  getCalendarEvents,
  getHabits,
  getTasks,
  localDateString,
  type Task,
} from "../lib/data";
import CaptureWidget from "./CaptureWidget";
import NewTaskWidget from "./NewTaskWidget";
import TalkWidget from "./TalkWidget";
import TodayWidget, { type TodayWidgetProps } from "./TodayWidget";

function taskRank(task: Task): string {
  if (task.dueDate) return task.dueDate;
  return "9999-99-99";
}

function eventTime(start: string, allDay: boolean): string {
  if (allDay) return "all day";
  return new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function buildEmptySnapshot(): TodayWidgetProps {
  return {
    dateLabel: new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    overdueCount: 0,
    dueTodayCount: 0,
    habitDone: 0,
    habitTotal: 0,
    tasks: [],
    habits: [],
    events: [],
    updatedAt: "",
  };
}

/** Push launcher + Today snapshots so the home screen never shows a blank first paint. */
export function seedWidgetSnapshots(): void {
  try {
    TalkWidget.updateSnapshot({ ready: true });
    NewTaskWidget.updateSnapshot({ ready: true });
    CaptureWidget.updateSnapshot({ ready: true });
    TodayWidget.updateSnapshot(buildEmptySnapshot());
  } catch {
    // Expo Go / stubs — ignore.
  }
}

/** Refresh the Today large widget from live device APIs. Safe to call often. */
export async function syncTodayWidget(): Promise<void> {
  try {
    const today = localDateString(0);
    const [tasks, habits, calendar] = await Promise.all([
      getTasks(),
      getHabits(today, today),
      getCalendarEvents(5),
    ]);

    const openTasks = (tasks ?? []).filter((t) => t.status !== "lesno");
    const overdueCount = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;
    const dueTodayCount = openTasks.filter((t) => t.dueDate === today).length;

    const nextTasks = [...openTasks]
      .sort((a, z) => taskRank(a).localeCompare(taskRank(z)) || a.title.localeCompare(z.title))
      .slice(0, 4)
      .map((task) => ({
        title: task.title,
        meta: `${task.dueDate ? (task.dueDate === today ? "today" : task.dueDate) : "no date"} / ${task.priority}`,
        overdue: Boolean(task.dueDate && task.dueDate < today),
      }));

    const todayDow = new Date().getDay();
    const todaysHabits = (habits?.habits ?? []).filter((h) => h.daysOfWeek[todayDow] !== false);
    const completed = new Set(
      (habits?.completions ?? [])
        .filter((c) => c.completedDate === today)
        .map((c) => c.habitId),
    );
    const habitRows = todaysHabits.slice(0, 4).map((habit) => ({
      name: habit.icon ? `${habit.icon} ${habit.name}` : habit.name,
      done: completed.has(habit.id),
    }));

    const events = (calendar?.events ?? []).slice(0, 3).map((event) => ({
      time: eventTime(event.start, event.allDay),
      title: event.title,
    }));

    const snapshot: TodayWidgetProps = {
      dateLabel: new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      overdueCount,
      dueTodayCount,
      habitDone: todaysHabits.filter((h) => completed.has(h.id)).length,
      habitTotal: todaysHabits.length,
      tasks: nextTasks,
      habits: habitRows,
      events,
      updatedAt: new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
    };

    TodayWidget.updateSnapshot(snapshot);
    TodayWidget.reload();
  } catch {
    // Network / auth failures — leave the previous snapshot alone.
  }
}
