/**
 * /areas/[areaId] route-level loading boundary. App Router prefetch for a
 * dynamic route only warms up to the nearest loading boundary, so this is what
 * a prefetched navigation actually paints: the PageScaffold geometry (same
 * measure, same gutters, same header rhythm) as placeholder blocks instead of
 * a spinner. Every dimension mirrors PageScaffold §2.9 so the real header
 * lands exactly on top of the skeleton with no reflow.
 */
export default function AreaDetailLoading() {
  return (
    <main className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1120px] px-8 pt-10 pb-24">
        <output
          aria-label="Loading area"
          className="block animate-pulse motion-reduce:animate-none"
        >
          {/* Eyebrow */}
          <div className="mb-2 h-4 w-12 rounded bg-[var(--hover)]" />
          {/* Title row: icon box + display-size bar, action stubs right */}
          <div className="flex items-start gap-3">
            <div className="size-8 shrink-0 rounded-lg bg-[var(--hover)]" />
            <div className="mt-1 h-7 w-64 rounded-lg bg-[var(--hover)]" />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="size-8 rounded-lg bg-[var(--hover)]" />
              <div className="h-8 w-28 rounded-lg bg-[var(--hover)]" />
            </div>
          </div>
          {/* Meta row */}
          <div className="mt-3 h-4 w-48 rounded bg-[var(--hover)]" />

          {/* Projects section: title bar, then three register rows */}
          <div className="mt-8">
            <div className="mb-3 h-5 w-24 rounded bg-[var(--hover)]" />
            <div className="flex flex-col gap-3">
              <div className="h-16 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)]" />
              <div className="h-16 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)]" />
              <div className="h-16 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)]" />
            </div>
          </div>

          {/* Tasks section stub */}
          <div className="mt-8 border-t border-[var(--edge)] pt-8">
            <div className="mb-3 h-5 w-16 rounded bg-[var(--hover)]" />
            <div className="flex flex-col gap-2">
              <div className="h-9 rounded-lg bg-[var(--hover)]" />
              <div className="h-9 rounded-lg bg-[var(--hover)]" />
            </div>
          </div>
        </output>
      </div>
    </main>
  );
}
