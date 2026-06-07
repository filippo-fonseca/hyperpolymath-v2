import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { AreasTree } from "@/components/areas/AreasTree";

/**
 * LifeOsAreasSection — the centerpiece of /lifeos.
 *
 * Mirrors /areas's data fetch verbatim so any sidebar-tree invalidation
 * downstream lights both surfaces up the same way; no new query
 * infrastructure is invented here. The wrapping <section> adds a quiet
 * section header with an "Open full view →" link so /areas remains the
 * dedicated tool, while /lifeos surfaces it as a tile within a larger page.
 *
 * Server Component — owns its own auth gate so page.tsx can stay a thin
 * orchestrator as more sections land in Tasks 4–6.
 */
export async function LifeOsAreasSection() {
  const user = await requireOnboarded();
  // Identical to /areas: fetch the full tree (archived projects included),
  // then drop archived AREAS at the boundary — the homepage shouldn't
  // surface archived areas.
  const [fullTree, oauthAvatar] = await Promise.all([
    getSidebarTree(user.id, true),
    getAuthAvatar(),
  ]);
  const areas = fullTree.filter((a) => a.archivedAt === null);

  const rootAvatarUrl = user.avatarUrl || oauthAvatar.avatarUrl;
  const rootLabel = user.displayName?.trim() || user.email;
  const rootInitial = (
    user.displayName?.trim() ||
    user.email ||
    "·"
  )
    .charAt(0)
    .toUpperCase();

  return (
    <section className="mb-12">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
          Areas
        </h2>
        <a
          href="/areas"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          Open full view →
        </a>
      </header>
      <AreasTree
        areas={areas}
        rootAvatarUrl={rootAvatarUrl}
        rootInitial={rootInitial}
        rootLabel={rootLabel}
      />
    </section>
  );
}
