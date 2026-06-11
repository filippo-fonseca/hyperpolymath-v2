import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { AreasTree } from "@/components/areas/AreasTree";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { AreasPageHeader } from "@/components/areas/AreasPageHeader";
import { AreaCardMenu } from "@/components/areas/AreaCardMenu";

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
  const rootInitial =
    (user.displayName?.trim() || user.email || "·").charAt(0).toUpperCase();

  // Sentinel area: name === 'No Area' and no emoji
  const isSentinel = (a: { name: string; emoji: string | null }) =>
    a.name === "No Area" && a.emoji === null;

  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1280px] px-6 md:px-10 pt-6 pb-12">
        <Breadcrumbs items={[{ label: "Areas" }]} className="mb-6" />

        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="text-center flex-1 space-y-1">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]">
              Areas
            </h1>
            <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
              "Energy is the currency of productivity." — Ali Abdaal
            </p>
          </div>
          <AreasPageHeader userId={user.id} />
        </header>

        <AreasTree
          areas={areas}
          rootAvatarUrl={rootAvatarUrl}
          rootInitial={rootInitial}
          rootLabel={rootLabel}
        />

        {/* Manage areas — per-area ⋯ menu rows below the tree */}
        {areas.length > 0 && (
          <section className="mt-10">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Manage areas
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
                ({areas.length})
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-[var(--edge)]">
              {areas.map((area) => (
                <li
                  key={area.id}
                  className="group/area-row flex items-center gap-3 py-2.5 px-1"
                >
                  {area.emoji ? (
                    <span
                      className="text-base leading-none shrink-0"
                      aria-hidden="true"
                    >
                      {area.emoji}
                    </span>
                  ) : (
                    <span className="w-5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-serif text-[15px] text-[var(--ink)] flex-1 leading-snug">
                    {area.name}
                    {isSentinel(area) && (
                      <em className="font-mono text-[10px] not-italic text-[var(--ink-muted)] ml-2 tracking-[0.06em]">
                        (auto-created bucket)
                      </em>
                    )}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)] shrink-0">
                    {area.projects.length} project
                    {area.projects.length === 1 ? "" : "s"}
                  </span>
                  <AreaCardMenu
                    areaId={area.id}
                    areaName={area.name}
                    areaEmoji={area.emoji}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
