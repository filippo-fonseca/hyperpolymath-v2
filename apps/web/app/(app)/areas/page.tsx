import { AreasPageClient } from "@/components/areas/AreasPageClient";
import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";

/**
 * /areas — homepage view of the user's life-OS hierarchy.
 *
 * Tree visualization with the signed-in user's avatar as the root node and
 * every active area branching off it. Clicking an area name navigates into
 * the dedicated area page; clicking a project goes straight to that project.
 *
 * Data reuses `getSidebarTree` (the same fetch the sidebar uses) so cache
 * invalidation from anywhere is automatic on next nav — no per-page query
 * key to maintain.
 *
 * CRUD affordances added in Quick 260611-g2z: "New Area" button + per-area ⋯
 * menu (Edit + Delete) in the "Manage areas" section below the tree. These
 * do NOT require the sidebar — router.refresh() settles all mutations.
 */
export default async function AreasPage() {
  const user = await requireOnboarded();
  // Fetch the full tree (archived projects included) so the "Show archived"
  // toggle is a pure client-side filter. We still drop archived AREAS at
  // the server boundary — they don't belong on the homepage.
  const [fullTree, oauthAvatar] = await Promise.all([
    getSidebarTree(user.id, true),
    getAuthAvatar(),
  ]);
  const areas = fullTree.filter((a) => a.archivedAt === null);

  const rootAvatarUrl = user.avatarUrl || oauthAvatar.avatarUrl;
  const rootLabel = user.displayName?.trim() || user.email;
  const rootInitial = (user.displayName?.trim() || user.email || "·").charAt(0).toUpperCase();

  return (
    // The measure and gutters belong to PageScaffold (inside AreasPageClient)
    // so this route's H1 left edge lines up with every other route's.
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <AreasPageClient
        initialAreas={areas}
        userId={user.id}
        rootAvatarUrl={rootAvatarUrl}
        rootInitial={rootInitial}
        rootLabel={rootLabel}
      />
    </main>
  );
}
