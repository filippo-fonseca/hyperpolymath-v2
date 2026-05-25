import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hashtags as hashtagsTable, projects, users } from "@/lib/db/schema";
import { requireOnboarded } from "@/lib/auth/get-user";
import { JarvisConsole } from "@/components/jarvis/JarvisConsole";
import { loadJarvisTurns } from "@/app/actions/jarvis-turns";
import type {
  ScrollbackAction,
  ScrollbackClarification,
  ScrollbackTurn,
} from "@/components/jarvis/jarvis-types";

/**
 * /today — JARVIS Console (D-01).
 *
 * Replaces the Phase 1 placeholder. The authenticated homescreen IS the
 * JARVIS interaction surface per PROJECT.md "Homescreen is the JARVIS
 * interaction surface" and the JARVIS-01 requirement.
 *
 * Server Component pre-fetches the data the composer needs (projects for
 * \$project autocomplete, hashtags for \# autocomplete, the user's IANA
 * timezone for client-side chrono pre-parse).
 */
export const dynamic = "force-dynamic";

export default async function TodayPage() {
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
    loadJarvisTurns(),
  ]);

  const userTimezone = userRows[0]?.timezone ?? "America/New_York";

  // Hydrate persisted scrollback into the client's ScrollbackTurn union.
  // Streaming turns persisted before completion (rare — refresh mid-stream)
  // are normalised to "done" so the UI doesn't render an infinite spinner.
  const initialTurns: ScrollbackTurn[] = turnsResult.success
    ? turnsResult.data.map((r): ScrollbackTurn => {
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

  return (
    <JarvisConsole
      userTimezone={userTimezone}
      initialProjects={projectRows.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
      }))}
      initialHashtags={hashtagRows}
      initialTurns={initialTurns}
    />
  );
}
