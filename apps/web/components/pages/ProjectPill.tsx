/**
 * One effective-project pill for the Wiki surfaces (Phase 23).
 *
 * Two visual registers, matching the existing project-chip vocabulary in
 * PageDetailClient (solid surface chip) and its "Link project" affordance
 * (dashed border):
 *   - DIRECT  : solid `bg-[var(--surface)]` chip with a solid edge. The project
 *               is linked straight to this element (its own pages_projects /
 *               folder_projects row).
 *   - INHERITED: ghosted (lower opacity), DASHED edge, transparent fill, with an
 *               "inherited from <folder>" title. The link lives on an ancestor
 *               folder and cascades down; it is read-only here (Phase 24).
 *
 * Presentational only — no data fetching, safe in any client component.
 */
export function ProjectPill({
  name,
  isInherited,
  sourceFolderName,
}: {
  name: string;
  isInherited: boolean;
  sourceFolderName?: string;
}) {
  if (isInherited) {
    return (
      <span
        title={
          sourceFolderName
            ? `Inherited from ${sourceFolderName}`
            : "Inherited from a parent folder"
        }
 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-micro font-mono italic text-[var(--ink-muted)] border border-dashed border-[var(--edge)] opacity-70"
      >
        {name}
      </span>
    );
  }
  return (
 <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-micro font-mono text-[var(--ink-muted)] bg-[var(--surface)] border border-[var(--edge)]">
      {name}
    </span>
  );
}

/**
 * Render a row of effective-project pills. Resolves project ids to names via
 * `projectNames`; skips any id with no known name (a project the user can't see
 * or that was deleted). Returns null when there is nothing to show so callers
 * don't render an empty gap.
 */
export function ProjectPillRow({
  links,
  projectNames,
  className,
}: {
  links: Array<{
    projectId: string;
    isInherited: boolean;
    sourceFolderName?: string;
  }>;
  projectNames: Map<string, string>;
  className?: string;
}) {
  const resolved = links
    .map((l) => ({ ...l, name: projectNames.get(l.projectId) }))
    .filter((l): l is typeof l & { name: string } => Boolean(l.name));
  if (resolved.length === 0) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {resolved.map((l) => (
        <ProjectPill
          key={`${l.projectId}:${l.isInherited ? "i" : "d"}`}
          name={l.name}
          isInherited={l.isInherited}
          sourceFolderName={l.sourceFolderName}
        />
      ))}
    </span>
  );
}
