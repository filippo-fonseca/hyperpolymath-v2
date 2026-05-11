import { and, eq, isNull } from "drizzle-orm";
import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getHashtagsForUser } from "@/app/actions/hashtags";
import { CapturesClient } from "@/components/captures/CapturesClient";

interface Props {
  searchParams: Promise<{ tag?: string }>;
}

/**
 * /captures — captures feed (CAPT-01..08).
 *
 * Server Component shell + CapturesClient island (D-18).
 * - Initial fetch in parallel: feed (optionally hashtag-filtered via ?tag=<id>) +
 *   hashtag sidebar data (counts) + projects list (composer multi-select)
 * - Per Next.js 16: searchParams is Promise<...>
 */
export default async function CapturesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await requireOnboarded();

  const [capturesList, hashtagsResult, projectsForComposer] = await Promise.all(
    [
      getCapturesForUser(user.id, { hashtagId: sp.tag }),
      getHashtagsForUser(),
      db
        .select({
          id: projects.id,
          name: projects.name,
          isClass: projects.isClass,
          courseCode: projects.courseCode,
        })
        .from(projects)
        .where(
          and(eq(projects.userId, user.id), isNull(projects.archivedAt)),
        ),
    ],
  );

  const hashtags = hashtagsResult.success ? hashtagsResult.data : [];

  return (
    <CapturesClient
      initialCaptures={capturesList}
      hashtags={hashtags}
      projects={projectsForComposer}
    />
  );
}
