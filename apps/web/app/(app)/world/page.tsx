import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { WorldLoader } from "@/components/world/WorldLoader";

/**
 * /world — The Studiolo, the 3D theatre of the life-OS (U-02 scaffold).
 *
 * Server Component. Lives in the authenticated `(app)` route group, so it
 * inherits the full provider stack from `(app)/layout.tsx` — auth gate,
 * QueryProvider (TanStack Query), NuqsAdapter, SearchProvider,
 * NavHistoryProvider, AppShell. The Canvas island therefore sits INSIDE the
 * existing QueryClient and reads the SAME shared caches the 2D app uses (no
 * parallel store).
 *
 * SSR-seeds the same data the 2D surfaces seed (active sidebar tree, all tasks,
 * captures) so the client island hydrates its shared-key queries with no extra
 * round-trip. All three-touching code lives behind WorldLoader's ssr:false
 * boundary — this file ships zero 3D bytes.
 */
export default async function WorldPage() {
  const user = await getUserOrRedirect();

  const [initialTree, initialTasks, initialCaptures] = await Promise.all([
    getSidebarTree(user.id, false),
    getAllTasksForUser(user.id),
    getCapturesForUser(user.id),
  ]);

  return (
    <main
      className="relative min-h-full w-full overflow-hidden bg-[#120E0B]"
      style={{ height: "100%" }}
    >
      <WorldLoader
        userId={user.id}
        initialTree={initialTree}
        initialTasks={initialTasks}
        initialCaptures={initialCaptures}
      />
    </main>
  );
}
