"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hashtags as hashtagsTable, projects, users } from "@/lib/db/schema";
import { requireOnboarded } from "@/lib/auth/get-user";
import { loadJarvisHistoryPage } from "@/app/actions/jarvis-turns";
import type {
  ScrollbackAction,
  ScrollbackClarification,
  ScrollbackTurn,
} from "@/components/jarvis/jarvis-types";

export interface JarvisInitPayload {
  userTimezone: string;
  initialProjects: { id: string; name: string; icon: string | null }[];
  initialHashtags: { id: string; name: string; displayName: string }[];
  initialTurns: ScrollbackTurn[];
  initialHasMore: boolean;
  initialOldestAt: string | null;
}

/**
 * loadJarvisInit — fetch the same bundle /today (page.tsx) needs, exposed as
 * a Server Action so the side panel can hydrate JarvisConsole lazily when
 * split-screen is first enabled. Mirrors the shape produced in /today server
 * code so the consumer can drop the result into <JarvisConsole {...payload} />.
 */
export async function loadJarvisInit(): Promise<JarvisInitPayload> {
  const user = await requireOnboarded();

  const [projectRows, hashtagRows, userRows, turnsResult] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, icon: projects.icon })
      .from(projects)
      .where(eq(projects.userId, user.id))
      .orderBy(desc(projects.updatedAt)),
    db
      .select({
        id: hashtagsTable.id,
        name: hashtagsTable.name,
        displayName: hashtagsTable.displayName,
      })
      .from(hashtagsTable)
      .where(eq(hashtagsTable.userId, user.id)),
    db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    loadJarvisHistoryPage({ limit: 10 }),
  ]);

  const userTimezone = userRows[0]?.timezone ?? "America/New_York";

  const initialTurns: ScrollbackTurn[] = turnsResult.success
    ? turnsResult.data.turns.map((r): ScrollbackTurn => {
        if (r.kind === "user") {
          return {
            kind: "user",
            id: r.id,
            text: r.text ?? "",
            createdAt: new Date(r.createdAt),
          };
        }
        const rawStatus = r.status === "streaming" ? "done" : r.status;
        return {
          kind: "assistant",
          id: r.id,
          textDelta: r.textDelta ?? "",
          actions: (r.actions as ScrollbackAction[]) ?? [],
          status: (rawStatus as "done" | "error") ?? "done",
          errorMessage: r.errorMessage ?? undefined,
          clarification:
            (r.clarification as ScrollbackClarification | null) ?? undefined,
          createdAt: new Date(r.createdAt),
        };
      })
    : [];

  const initialHasMore = turnsResult.success ? turnsResult.data.hasMore : false;
  const initialOldestAt = turnsResult.success ? turnsResult.data.oldestAt : null;

  return {
    userTimezone,
    initialProjects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
    })),
    initialHashtags: hashtagRows,
    initialTurns,
    initialHasMore,
    initialOldestAt,
  };
}
