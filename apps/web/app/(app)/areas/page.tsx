import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { AreasTree } from "@/components/areas/AreasTree";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";

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
  const rootInitial =
    (user.displayName?.trim() || user.email || "·").charAt(0).toUpperCase();

  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        <Breadcrumbs items={[{ label: "Areas" }]} className="mb-6" />
        <header className="mb-4 text-center space-y-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]">
            Areas
          </h1>
          <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
            “Energy is the currency of productivity.” — Ali Abdaal
          </p>
        </header>

        <AreasTree
          areas={areas}
          rootAvatarUrl={rootAvatarUrl}
          rootInitial={rootInitial}
          rootLabel={rootLabel}
        />
      </div>
    </main>
  );
}
