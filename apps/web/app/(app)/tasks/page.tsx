import { TasksClient } from "@/components/tasks/TasksClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getHashtagSuggestions } from "@/lib/db/queries/hashtags";
import { areas, people, projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

interface Props {
  searchParams: Promise<{
    priority?: string; // comma-joined multi-select
    status?: string; // comma-joined multi-select
    due?: string; // comma-joined multi-select (Blocker 3)
    project?: string; // comma-joined multi-select (Blocker 3)
    view?: string;
  }>;
}

/**
 * /tasks — Server Component shell + TasksClient island.
 *
 * Per D-18 + Pitfall 3 (research): SSR fetches initial tasks + projects in parallel,
 * derives initialFilters from searchParams so nuqs hydration on client matches SSR.
 * No hydration mismatch possible: server and client start from the same URL state.
 *
 * Phase 3 (Plan 03-02): userId threaded down so TasksClient can mount
 * useQuery({ queryKey: tableKey("tasks", userId) }) + useTableSubscription.
 */
export default async function TasksPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await requireOnboarded();

  const [tasks, projectRows, areaRows, hashtagRows, peopleRows] = await Promise.all([
    getAllTasksForUser(user.id),
    db
      .select({
        id: projects.id,
        name: projects.name,
        icon: projects.icon,
        isClass: projects.isClass,
        courseCode: projects.courseCode,
        areaName: areas.name,
        areaEmoji: areas.emoji,
      })
      .from(projects)
      .leftJoin(areas, eq(projects.areaId, areas.id))
      .where(and(eq(projects.userId, user.id), isNull(projects.archivedAt))),
    db
      .select({
        id: areas.id,
        name: areas.name,
        emoji: areas.emoji,
      })
      .from(areas)
      .where(and(eq(areas.userId, user.id), isNull(areas.archivedAt))),
    getHashtagSuggestions(user.id),
    db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(eq(people.userId, user.id)),
  ]);

  // Per Pitfall 3: pass searchParams-derived initial filters so SSR matches client nuqs hydration.
  // Blocker 3: due and project are multi-select arrays (matching TaskFilters' useQueryStates schema).
  const initialFilters = {
    priority: sp.priority ? sp.priority.split(",").filter(Boolean) : [],
    status: sp.status ? sp.status.split(",").filter(Boolean) : [],
    due: sp.due ? sp.due.split(",").filter(Boolean) : [],
    project: sp.project ? sp.project.split(",").filter(Boolean) : [],
  };

  return (
    <TasksClient
      userId={user.id}
      initialTasks={tasks}
      projects={projectRows}
      areas={areaRows}
      initialFilters={initialFilters}
      hashtags={hashtagRows}
      people={peopleRows}
    />
  );
}
